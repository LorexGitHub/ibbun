# The API's Lambda function as a local container: AWS's Node 24 base image,
# which carries the Lambda Runtime Interface Emulator. Build the bundle first:
#   node apps/api/build-lambda.mjs
#   docker build -f apps/api/lambda.Dockerfile -t mojibun-api-lambda apps/api
# The stack deploys the same dist/lambda as a zip; this image is for local runs.
FROM public.ecr.aws/lambda/nodejs:24
COPY dist/lambda/ ${LAMBDA_TASK_ROOT}/
RUN cd ${LAMBDA_TASK_ROOT} && npm install --omit=dev --no-audit --no-fund
CMD ["index.handler"]
