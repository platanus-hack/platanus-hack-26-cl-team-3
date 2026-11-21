FROM python:3.12-slim AS model
RUN pip install --no-cache-dir --only-binary=:all: onnx==1.17.0 numpy==2.2.6 protobuf==5.29.5
ADD --checksum=sha256:0ab0c1b3ace708e539633af1744d5a95247fe4e14d3e08ff197ef82a6cb9bd93 https://huggingface.co/Xenova/clip-vit-base-patch32/resolve/6b7c523703ae26e39be4b03774966f8571c7f523/onnx/vision_model_int8.onnx /tmp/vision.onnx
COPY scripts/prepare-web-model.py /tmp/prepare-web-model.py
RUN python /tmp/prepare-web-model.py /tmp/vision.onnx /tmp/web-vision.onnx

FROM busybox:1.37.0 AS files
ADD --checksum=sha256:0a38facf0672dfaaeaf352e8a9f44533732b60b4af93b9dd507fe7c2d2be437b https://registry.npmjs.org/onnxruntime-web/-/onnxruntime-web-1.20.1.tgz /tmp/ort.tgz
COPY . /src/
COPY --from=model /tmp/web-vision.onnx /tmp/vision.onnx
RUN mkdir /www && cp -R /src/web/. /www/ && \
    mkdir /www/runtime && \
    tar -xzf /tmp/ort.tgz -C /tmp package/dist/ort.wasm.min.mjs package/dist/ort-wasm-simd-threaded.mjs package/dist/ort-wasm-simd-threaded.wasm && \
    cp /tmp/package/dist/* /www/runtime/ && cp /tmp/vision.onnx /www/runtime/vision.onnx && \
    chmod 644 /www/runtime/* && cp /src/app/src/detector/textos-clip.json /www/prompts.json && \
    rm /www/httpd.conf && \
    cd /www && shell_build=$(sha256sum index.html app.js styles.css manifest.webmanifest icon-*.png detector.js prompts.json runtime/* sw.js | sha256sum | cut -d ' ' -f 1) && \
    sed -i "s/__CAPO_AR_BUILD__/$shell_build/" sw.js && \
    if [ -f /src/prototype/vehicle-maps/index.html ]; then \
      mkdir /www/maps && cp /src/prototype/vehicle-maps/* /www/maps/; \
    fi

FROM busybox:1.37.0
COPY --from=files /www/ /www/
COPY web/httpd.conf /etc/httpd.conf
USER 65534:65534
EXPOSE 8080
HEALTHCHECK --interval=5s --timeout=3s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1
CMD ["httpd", "-f", "-p", "8080", "-h", "/www", "-c", "/etc/httpd.conf"]
