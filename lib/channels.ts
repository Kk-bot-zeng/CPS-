export const CHANNELS = [
  { code: "jd", name: "京东" },
  { code: "douyin", name: "抖音" },
  { code: "tmall", name: "天猫" },
] as const;

export type ChannelCode = (typeof CHANNELS)[number]["code"];
export type ChannelFilter = ChannelCode | "all";

export function isChannel(value: unknown): value is ChannelCode {
  return CHANNELS.some((channel) => channel.code === value);
}

export function channelName(value: string | null | undefined) {
  return (
    CHANNELS.find((channel) => channel.code === value)?.name ??
    value ??
    "未设置"
  );
}
