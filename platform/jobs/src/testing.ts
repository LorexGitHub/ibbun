import { randomUUID } from "node:crypto";
import { CreateQueueCommand, DeleteQueueCommand, GetQueueAttributesCommand, SQSClient } from "@aws-sdk/client-sqs";

export type TestQueue = { client: SQSClient; queueUrl: string; deadLetterUrl: string; stop: () => Promise<void> };

/** As in `docker/elasticmq/elasticmq.conf` and the AWS stack: a job goes to the dead-letter queue on its third failed receive. */
export const MAX_RECEIVES = 3;

/**
 * A fresh queue and dead-letter queue on ElasticMQ for one test, deleted on `stop()`.
 * The server is the one `compose.yaml` starts; CI runs ElasticMQ as a service on the same port.
 */
export const startTestQueue = async (visibilitySeconds: number): Promise<TestQueue> => {
  const client = new SQSClient({ endpoint: "http://localhost:9324", region: "elasticmq", credentials: { accessKeyId: "local", secretAccessKey: "local" } });
  const name = `test-${randomUUID()}`;
  const create = async (QueueName: string, Attributes: Record<string, string> = {}) =>
    (await client.send(new CreateQueueCommand({ QueueName, Attributes }))).QueueUrl!;
  const deadLetterUrl = await create(`${name}-dead-letters`);
  const { Attributes } = await client.send(new GetQueueAttributesCommand({ QueueUrl: deadLetterUrl, AttributeNames: ["QueueArn"] }));
  const queueUrl = await create(name, {
    VisibilityTimeout: String(visibilitySeconds),
    RedrivePolicy: JSON.stringify({ deadLetterTargetArn: Attributes!.QueueArn, maxReceiveCount: MAX_RECEIVES }),
  });
  return {
    client,
    queueUrl,
    deadLetterUrl,
    stop: async () => {
      await client.send(new DeleteQueueCommand({ QueueUrl: queueUrl }));
      await client.send(new DeleteQueueCommand({ QueueUrl: deadLetterUrl }));
      client.destroy();
    },
  };
};
