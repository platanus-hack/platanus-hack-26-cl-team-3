"""Export and verify the fixed-shape DINOv2 encoder shipped with Capo AR."""
import argparse
from pathlib import Path

import numpy as np
import onnx
from onnx import TensorProto, helper, numpy_helper
import onnxruntime as ort
import torch
from transformers import Dinov2Model

IMAGE_HEIGHT = 448
IMAGE_WIDTH = 672
TOKEN_SHAPE = (1, 48 * 32, 384)
QUERY_BLOCK_SIZE = 512


class Encoder(torch.nn.Module):
    def __init__(self, model):
        super().__init__()
        self.model = model

    def forward(self, pixels):
        patch_tokens = self.model(pixel_values=pixels).last_hidden_state[:, 1:]
        return torch.nn.functional.normalize(patch_tokens, dim=-1)


def store_half_weights(model):
    compressed_count = 0
    for initializer in model.graph.initializer:
        if initializer.data_type != TensorProto.FLOAT or np.prod(initializer.dims) < 1024:
            continue
        original_name = initializer.name
        half_weight = numpy_helper.to_array(initializer).astype(np.float16)
        initializer.CopyFrom(numpy_helper.from_array(half_weight, name=f"{original_name}_half"))
        model.graph.node.insert(
            0, helper.make_node("Cast", [initializer.name], [original_name], to=TensorProto.FLOAT)
        )
        compressed_count += 1
    return compressed_count


def tile_attention(graph):
    """Bound the score tensor by splitting queries while keeping every key and value."""
    token_count = 1 + TOKEN_SHAPE[1]
    blocks = [(start, min(start + QUERY_BLOCK_SIZE, token_count))
              for start in range(0, token_count, QUERY_BLOCK_SIZE)]
    boundaries = sorted({boundary for block in blocks for boundary in block})
    graph.initializer.extend([
        numpy_helper.from_array(np.array([boundary], dtype=np.int64), name=f"query_boundary_{boundary}")
        for boundary in boundaries
    ])
    graph.initializer.append(numpy_helper.from_array(np.array([2], dtype=np.int64), name="query_axis"))

    original_nodes = {node.name: node for node in graph.node}
    replaced = {}
    for layer in range(12):
        prefix = f"/model/encoder/layer.{layer}/attention/"
        scores, scale, softmax, context = (original_nodes.get(prefix + name)
                                           for name in ("MatMul", "Mul", "Softmax", "MatMul_1"))
        if (any(node is None for node in (scores, scale, softmax, context))
                or (scores.op_type, scale.op_type, softmax.op_type, context.op_type)
                != ("MatMul", "Mul", "Softmax", "MatMul")
                or scores.output[0] not in scale.input or scale.output[0] != softmax.input[0]
                or softmax.output[0] != context.input[0]
                or not any(attr.name == "axis" and attr.i == -1 for attr in softmax.attribute)):
            raise ValueError(f"Unexpected DINOv2 attention graph in layer {layer}")
        query, key = scores.input
        factor = next(value for value in scale.input if value != scores.output[0])
        value = context.input[1]
        tiled_nodes = []
        outputs = []
        for start, end in blocks:
            name = f"{prefix}query_{start}"
            sliced, logits, scaled, weights, result = (
                f"{name}/{suffix}" for suffix in ("slice", "logits", "scaled", "weights", "context")
            )
            tiled_nodes.extend([
                helper.make_node("Slice", [query, f"query_boundary_{start}", f"query_boundary_{end}", "query_axis"], [sliced]),
                helper.make_node("MatMul", [sliced, key], [logits]),
                helper.make_node("Mul", [logits, factor], [scaled]),
                helper.make_node("Softmax", [scaled], [weights], axis=-1),
                helper.make_node("MatMul", [weights, value], [result]),
            ])
            outputs.append(result)
        tiled_nodes.append(helper.make_node("Concat", outputs, list(context.output), axis=2))
        replaced.update({scores.name: [], scale.name: [], softmax.name: [], context.name: tiled_nodes})

    nodes = [output for node in graph.node for output in replaced.get(node.name, [node])]
    graph.ClearField("node")
    graph.node.extend(nodes)


def verify_encoder(path, inputs, expected):
    options = ort.SessionOptions()
    options.intra_op_num_threads = 4
    session = ort.InferenceSession(str(path), sess_options=options, providers=["CPUExecutionProvider"])
    measured, = session.run(["descriptors"], {"pixels": inputs.numpy()})
    if measured.shape != TOKEN_SHAPE or measured.dtype != np.float32 or not np.isfinite(measured).all():
        raise ValueError("The packaged encoder does not produce finite Float32 patch descriptors")
    error = float(np.max(np.abs(expected - measured)))
    token_cosines = np.sum(expected * measured, axis=-1)
    if error >= 0.002 or float(token_cosines.min()) < 0.9999:
        raise ValueError(f"Half-weight encoder differs from original model (maximum error {error})")
    print(f"Verified {measured.shape} Float32 output and maximum error {error:.6f}")


def export_encoder(source, destination, revision, license_path):
    torch.set_num_threads(4)
    model = Encoder(Dinov2Model.from_pretrained(
        source, local_files_only=True, attn_implementation="eager"
    )).eval()
    inputs = torch.linspace(-2, 2, 3 * IMAGE_HEIGHT * IMAGE_WIDTH).reshape(
        1, 3, IMAGE_HEIGHT, IMAGE_WIDTH
    )
    fp32_path = destination.with_suffix(".fp32.onnx")
    with torch.inference_mode():
        expected = model(inputs).numpy()
        torch.onnx.export(
            model, (inputs,), fp32_path, input_names=["pixels"],
            output_names=["descriptors"], opset_version=17, dynamo=False,
        )
    graph = onnx.load(fp32_path)
    tile_attention(graph.graph)
    compressed_count = store_half_weights(graph)
    if compressed_count == 0:
        raise ValueError("Encoder contains no Float16 weights")
    helper.set_model_props(graph, {
        "source": f"https://huggingface.co/facebook/dinov2-small/tree/{revision}",
        "license": license_path.read_text(encoding="utf-8"),
        "license_spdx": "Apache-2.0",
        "modifications": "Fixed-size normalized patch output, ONNX export, tiled attention, Float16 weight storage.",
    })
    onnx.checker.check_model(graph)
    onnx.save(graph, destination)
    if destination.stat().st_size >= fp32_path.stat().st_size * 0.6:
        raise ValueError("The packaged encoder exceeds the half-weight size budget")
    verify_encoder(destination, inputs, expected)
    fp32_path.unlink()
    print(f"Stored {compressed_count} tensors in Float16 with Float32 inference")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    parser.add_argument("revision")
    parser.add_argument("license", type=Path)
    args = parser.parse_args()
    export_encoder(args.source, args.destination, args.revision, args.license)


if __name__ == "__main__":
    main()
