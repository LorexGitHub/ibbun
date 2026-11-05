FROM python:3.13-slim
# SudachiPy and its dictionary are pinned together: SudachiDict's V0/V1 format break.
RUN pip install --no-cache-dir sudachipy==0.6.10 sudachidict_core==20250129
WORKDIR /app
COPY server.py .
EXPOSE 8000
CMD ["python", "server.py"]
