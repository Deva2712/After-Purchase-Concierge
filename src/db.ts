// DynamoDB single-table access (docs/ARCHITECTURE.md section 6.4). Keys: pk CUST#<hash> | STEPS#<productId>.
import { DynamoDBClient, ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION ?? 'us-west-2' }), {
  marshallOptions: { removeUndefinedValues: true },
});
const TABLE = () => process.env.TABLE_NAME ?? 'concierge';
const SESSION_TTL_S = 24 * 3600;
const RECORD_TTL_S = 30 * 24 * 3600;

export type Step = { n: number; title: string; detail: string };
export type Source = { document: string; page: number };
export type Steps = { steps: Step[]; source: Source; generatedAt: string };

export async function getSteps(productId: string, symptomKey: string): Promise<Steps | undefined> {
  const r = await ddb.send(new GetCommand({ TableName: TABLE(), Key: { pk: `STEPS#${productId}`, sk: symptomKey } }));
  return r.Item as Steps | undefined;
}

export async function putSteps(productId: string, symptomKey: string, s: Omit<Steps, 'generatedAt'>): Promise<void> {
  await ddb.send(new PutCommand({ TableName: TABLE(), Item: { pk: `STEPS#${productId}`, sk: symptomKey, ...s, generatedAt: new Date().toISOString() } }));
}

export type Session = {
  lastProductId?: string;
  lastOrderId?: string;
  lastLineItemId?: string;
  lastSymptomKey?: string;
  lastSymptomText?: string;
  lastOutcome?: string;
  updatedAt?: string;
};

export async function getSession(customerHash: string): Promise<Session | undefined> {
  const r = await ddb.send(new GetCommand({ TableName: TABLE(), Key: { pk: `CUST#${customerHash}`, sk: 'SESSION' } }));
  return r.Item as Session | undefined;
}

/** Merge the given fields into the session; the item expires 24 h after the last write. */
export async function putSession(customerHash: string, patch: Session): Promise<void> {
  const fields: Record<string, unknown> = { ...patch, updatedAt: new Date().toISOString(), ttl: Math.floor(Date.now() / 1000) + SESSION_TTL_S };
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};
  const sets: string[] = [];
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    names[`#${k}`] = k;
    values[`:${k}`] = v;
    sets.push(`#${k} = :${k}`);
  }
  await ddb.send(new UpdateCommand({
    TableName: TABLE(),
    Key: { pk: `CUST#${customerHash}`, sk: 'SESSION' },
    UpdateExpression: `SET ${sets.join(', ')}`,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
  }));
}

/**
 * Write a record once. `sk` carries the idempotency hash (e.g. CLAIM#<idem>), so a repeated call
 * fails the condition and the existing record is returned instead of a second one being created.
 */
export async function putOnce<T extends Record<string, unknown>>(customerHash: string, sk: string, record: T): Promise<{ created: boolean; record: T }> {
  const Key = { pk: `CUST#${customerHash}`, sk };
  try {
    await ddb.send(new PutCommand({
      TableName: TABLE(),
      Item: { ...Key, ...record, createdAt: new Date().toISOString(), ttl: Math.floor(Date.now() / 1000) + RECORD_TTL_S },
      ConditionExpression: 'attribute_not_exists(pk)',
    }));
    return { created: true, record };
  } catch (e) {
    if (!(e instanceof ConditionalCheckFailedException)) throw e;
    const r = await ddb.send(new GetCommand({ TableName: TABLE(), Key }));
    return { created: false, record: r.Item as T };
  }
}

export async function getRecord<T extends Record<string, unknown>>(customerHash: string, sk: string): Promise<T | undefined> {
  const r = await ddb.send(new GetCommand({ TableName: TABLE(), Key: { pk: `CUST#${customerHash}`, sk } }));
  return r.Item as T | undefined;
}

export async function listRecords(customerHash: string, skPrefix = ''): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const r = await ddb.send(new QueryCommand({
      TableName: TABLE(),
      KeyConditionExpression: skPrefix ? 'pk = :pk AND begins_with(sk, :p)' : 'pk = :pk',
      ExpressionAttributeValues: skPrefix ? { ':pk': `CUST#${customerHash}`, ':p': skPrefix } : { ':pk': `CUST#${customerHash}` },
      ExclusiveStartKey,
    }));
    items.push(...((r.Items ?? []) as Record<string, unknown>[]));
    ExclusiveStartKey = r.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (ExclusiveStartKey);
  return items;
}

/** Delete every item for the customer (session, claims, returns, parts). Returns the count. */
export async function deleteCustomer(customerHash: string): Promise<number> {
  const items = await listRecords(customerHash);
  for (let i = 0; i < items.length; i += 25) {
    await ddb.send(new BatchWriteCommand({
      RequestItems: { [TABLE()]: items.slice(i, i + 25).map(it => ({ DeleteRequest: { Key: { pk: it.pk, sk: it.sk } } })) },
    }));
  }
  return items.length;
}
