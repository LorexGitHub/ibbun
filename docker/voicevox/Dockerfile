# VOICEVOX ENGINE as a Lambda container image (#253). The engine's own HTTP
# server runs unchanged; the AWS Lambda Web Adapter turns each invocation into
# a request to it. Lambda's filesystem is read-only apart from /tmp, and it
# runs as an unprivileged user, so the image's gosu entrypoint goes.
FROM public.ecr.aws/awsguru/aws-lambda-adapter:0.9.1 AS adapter

FROM voicevox/voicevox_engine:cpu-0.24.1
COPY --from=adapter /lambda-adapter /opt/extensions/lambda-adapter
ENV HOME=/tmp \
    XDG_DATA_HOME=/tmp \
    AWS_LWA_PORT=50021 \
    AWS_LWA_READINESS_CHECK_PATH=/version
ENTRYPOINT []
CMD ["/opt/voicevox_engine/run", "--host", "127.0.0.1", "--port", "50021"]
