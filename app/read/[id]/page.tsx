"use client";

import { useParams } from "next/navigation";
import { ReaderView } from "@/components/ReaderView";

export default function ReadPage() {
  const params = useParams<{ id: string }>();
  return <ReaderView id={params.id} />;
}
