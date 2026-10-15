"use client";

import { Button } from "@/components/ui/Button";
import { TABLE_PAGE_SIZE } from "@/lib/domain";
export { TABLE_PAGE_SIZE } from "@/lib/domain";

export function TablePagination({
  page,
  totalItems,
  label,
  onPageChange,
}: {
  page: number;
  totalItems: number;
  label: string;
  onPageChange: (page: number) => void;
}) {
  const pageCount = Math.max(1, Math.ceil(totalItems / TABLE_PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const firstVisible = totalItems === 0 ? 0 : (currentPage - 1) * TABLE_PAGE_SIZE + 1;
  const lastVisible = Math.min(currentPage * TABLE_PAGE_SIZE, totalItems);
  const pages =
    pageCount <= 5
      ? Array.from({ length: pageCount }, (_, index) => index + 1)
      : [...new Set([1, currentPage - 1, currentPage, currentPage + 1, pageCount])]
          .filter((number) => number >= 1 && number <= pageCount)
          .sort((a, b) => a - b);

  return (
    <footer className="flex flex-col gap-2 border-t border-zinc-200 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-zinc-500">
        Showing {firstVisible}–{lastVisible} of {totalItems} {label}
      </p>
      <nav aria-label={`${label} pages`} className="flex flex-wrap items-center gap-1">
        <Button
          type="button"
          variant="secondary"
          size="compact"
          disabled={currentPage === 1}
          onClick={() => onPageChange(currentPage - 1)}
        >
          Previous
        </Button>
        {pages.map((pageNumber, index) => (
          <span key={pageNumber} className="flex items-center gap-1">
            {index > 0 && pageNumber - pages[index - 1] > 1 ? (
              <span aria-hidden="true" className="px-0.5 text-xs text-zinc-400">…</span>
            ) : null}
            <Button
              type="button"
              variant={pageNumber === currentPage ? "primary" : "secondary"}
              size="compact"
              className="min-w-7 px-1.5"
              aria-label={`Page ${pageNumber}`}
              aria-current={pageNumber === currentPage ? "page" : undefined}
              onClick={() => onPageChange(pageNumber)}
            >
              {pageNumber}
            </Button>
          </span>
        ))}
        <Button
          type="button"
          variant="secondary"
          size="compact"
          disabled={currentPage === pageCount}
          onClick={() => onPageChange(currentPage + 1)}
        >
          Next
        </Button>
      </nav>
    </footer>
  );
}
