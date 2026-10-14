"use client";

import { useParams } from "next/navigation";
import { StudioView } from "@/components/StudioView";

export default function NovelPage() {
  const params = useParams<{ id: string }>();
  return <StudioView id={params.id} />;
}
