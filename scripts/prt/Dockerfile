FROM python:3.12-slim
WORKDIR /opt/prt
RUN pip install --no-cache-dir openpyxl==3.1.5 et-xmlfile==2.0.0
COPY archives.txt import_vehicles.py seed.py ./
CMD ["python", "-u", "seed.py"]
