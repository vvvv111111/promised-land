import { notFound, redirect } from "next/navigation";
import GiftExperience, { type GiftStep } from "@/components/gift/GiftExperience";
import { WINTER_GIFT_ID, EXAMPLE_GIFT_ID } from "@/world/WinterGift";

const steps = ["create", "generating", "edit", "complete", "open", "room", "story"];

export default async function GiftPage({ params, searchParams }: { params: Promise<{ step: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { step } = await params;
  if (!steps.includes(step)) notFound();
  const query = await searchParams;
  const requested = typeof query.gift === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(query.gift) ? query.gift : WINTER_GIFT_ID;
  const giftId = ["create", "generating", "edit", "complete"].includes(step) && requested === EXAMPLE_GIFT_ID ? WINTER_GIFT_ID : requested;
  if (step === "create" || step === "generating") redirect(`/gift/edit?mode=sender&gift=${giftId}`);
  if (step === "room" || step === "edit") {
    const mode = step === "room" ? "recipient" : "sender";
    if (query.mode !== mode || query.gift !== giftId) redirect(`/gift/${step}?mode=${mode}&gift=${giftId}`);
  }
  return <GiftExperience key={`${step}:${giftId}`} step={step as GiftStep} giftId={giftId} />;
}
