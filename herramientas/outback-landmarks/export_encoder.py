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
    compressed_count = store_half_weights(graph)
    if compressed_count == 0:
        raise ValueError("Encoder contains no Float16 weights")
    helper.set_model_props(graph, {
        "source": f"https://huggingface.co/facebook/dinov2-small/tree/{revision}",
        "license": license_path.read_text(encoding="utf-8"),
        "license_spdx": "Apache-2.0",
        "modifications": "Fixed-size normalized patch output, ONNX export, Float16 weight storage.",
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
