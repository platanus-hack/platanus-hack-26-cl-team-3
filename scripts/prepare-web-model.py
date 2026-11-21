"""Re-encode the pinned CLIP patch convolution for ONNX Runtime's WASM kernel."""
import sys

import numpy as np
import onnx
from onnx import numpy_helper

model = onnx.load(sys.argv[1])
conv, = (node for node in model.graph.node if node.op_type == "ConvInteger")
constants = {tensor.name: tensor for tensor in model.graph.initializer}
for name in (conv.input[1], conv.input[3]):
    tensor = constants[name]
    values = numpy_helper.to_array(tensor)
    if values.dtype != np.int8:
        raise ValueError(f"Expected signed 8-bit weights and zero point: {name}")
    # (weight + 128) - (zero point + 128) preserves every integer product.
    unsigned = (values.astype(np.int16) + 128).astype(np.uint8)
    tensor.CopyFrom(numpy_helper.from_array(unsigned, name))

onnx.checker.check_model(model)
onnx.save(model, sys.argv[2])
