FROM busybox:1.37.0 AS files
COPY . /src/
RUN mkdir /www && cp /src/web/* /www/ && \
    rm /www/httpd.conf && \
    cd /www && shell_build=$(sha256sum index.html app.js styles.css manifest.webmanifest icon-*.png sw.js | sha256sum | cut -d ' ' -f 1) && \
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
