import { notFound, redirect } from "next/navigation";
import GiftExperience, { type GiftStep } from "@/components/gift/GiftExperience";

const steps = ["create", "generating", "edit", "complete", "open", "room", "story"];

export default async function GiftPage({ params, searchParams }: { params: Promise<{ step: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { step } = await params;
  if (!steps.includes(step)) notFound();
  if (step === "room" || step === "edit") {
    const query = await searchParams;
    const mode = step === "room" ? "recipient" : "sender";
    if (query.mode !== mode || query.gift !== "winter-local-v1") redirect(`/gift/${step}?mode=${mode}&gift=winter-local-v1`);
  }
  return <GiftExperience step={step as GiftStep} />;
}
