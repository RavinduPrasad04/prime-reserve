import { PageHeader, PageShell } from "@/components/ui/PageHeader";
import { QuickAvailabilityPageContent } from "@/components/layout/QuickAvailabilityWidget";

export default function QuickAvailabilityPage() {
  return (
    <PageShell>
      <PageHeader
        title="Quick Availability"
        description="Find resources available for your selected date and time."
      />
      <section className="max-w-3xl rounded-xl border border-zinc-200 bg-white p-4 sm:p-5">
        <QuickAvailabilityPageContent />
      </section>
    </PageShell>
  );
}
