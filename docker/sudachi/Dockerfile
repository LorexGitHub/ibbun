FROM python:3.13-slim
# SudachiPy and its dictionary are pinned together: SudachiDict's V0/V1 format break.
RUN pip install --no-cache-dir sudachipy==0.6.10 sudachidict_core==20250129
# On Lambda, the Web Adapter extension turns function URL events into plain HTTP to server.py (ADR 0015). Elsewhere it never starts.
COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:0.9.1 /lambda-adapter /opt/extensions/lambda-adapter
ENV AWS_LWA_PORT=8000 AWS_LWA_READINESS_CHECK_PATH=/health
WORKDIR /app
COPY server.py .
EXPOSE 8000
CMD ["python", "server.py"]
