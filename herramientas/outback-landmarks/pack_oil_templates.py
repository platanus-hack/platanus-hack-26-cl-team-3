"""Pack BGR patches from original decoded frames and measured oil-cap top centers."""
import argparse
import hashlib
from pathlib import Path
import cv2
import numpy as np

# Each local JPEG is an original WhatsApp video frame. The columns store its
# hand-marked upper-face center and the image vectors of two model axes.
CALIBRATION = [
    ('0-000.jpg', '8d3b0dfb54cbef641770e5df0c49b2a863b03a8f03da0e12c94abc8a13b4a106', [792, 466], [[1.6469290212214673, 0.30035432622321423], [-0.027925462364692066, 0.9159797008263126]]),
    ('0-092.jpg', '751ac274b4a97efef8f28b684038b735924894ea7bcb72ddab8eeeee336949ae', [785, 542], [[1.6558640537571137, 0.32134312232301454], [-0.053362593535780434, 0.9359321876381728]]),
    ('0-184.jpg', 'fee62afe26d27b12e34157ab63e0c67e1db041aca7d95725aab9751ce0ba98f5', [759, 392], [[1.6338135087305545, 0.28038862878975124], [-0.049254803774090306, 0.9468445319814691]]),
    ('1-000.jpg', '14220f62137166feb379dff322c16e1866da950e1aca47c1943b7f5935a42204', [824, 428], [[2.109836798575543, 0.3417785351798557], [-0.013411108419688844, 1.4218712567872558]]),
    ('1-148.jpg', '9b0fbbc3ac9827c9984c0569b21f4c574b166785f9b9ec3eb97d41ca69cb4995', [856, 467], [[2.1565173608381656, 0.37865774192835033], [-0.03587529035564785, 1.6022694841857401]]),
    ('1-295.jpg', '46bcd46283dba22473fd68de08580222d47ba8d7d851d4bcd7ebd64e7f0b233c', [817, 331], [[1.7953384227447486, 0.27719300808962544], [0.002654257332380894, 0.9617590039738957]]),
    ('3-150.jpg', '2556196e5e095c8d1d3c9cdc0055ea7c65a9e3365821f449f1ca182c4e475db1', [223, 716], [[1.5978103942798612, 0.251396178948994], [-0.18627187812137436, 0.8640409424673408]]),
    ('3-180.jpg', '3613af4c0470ff3c88cd4edcec2f59752cd22fd8539133142a570c9788485999', [290, 716], [[1.5999011136841546, 0.25589312544838094], [-0.13455780470337686, 0.8726164171230266]]),
]

def pack(frames, output):
    data = bytearray()
    for name, fingerprint, center, axes in CALIBRATION:
        path = frames / name
        if hashlib.sha256(path.read_bytes()).hexdigest() != fingerprint:
            raise ValueError(f"Unexpected source frame: {name}")
        image = cv2.imread(str(path), cv2.IMREAD_COLOR)
        axes = np.asarray(axes, dtype=float)
        transform = np.column_stack((axes, center - axes @ np.array([23, 23])))
        patch = cv2.warpAffine(image, transform, (47, 47),
                               flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP,
                               borderMode=cv2.BORDER_REPLICATE)
        data.extend(patch.tobytes())
    output.write_bytes(data)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("frames", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    pack(args.frames, args.output)
