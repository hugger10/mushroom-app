import { SnowflakeId } from "@akashrajpurohit/snowflake-id";

const snowflake = SnowflakeId({
  workerId: 1,
  epoch: new Date("2025-01-01T00:00:00Z").getTime() //2025-01-01 00:00:00
});

// console.log(snowflake.generate()); // 97267729253273600

export function generateId(): string {
  return snowflake.generate();
}
