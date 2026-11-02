"use client";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/misc";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Card>
      <EmptyState
        icon={AlertTriangle}
        title="Something went wrong"
        description={error.message && process.env.NODE_ENV !== "production" ? error.message : "The page could not be loaded. Please try again."}
        action={<Button onClick={reset}>Try again</Button>}
      />
    </Card>
  );
}
