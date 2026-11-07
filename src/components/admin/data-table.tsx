'use client';

import { type ColumnDef, flexRender, getCoreRowModel, type RowSelectionState, useReactTable } from '@tanstack/react-table';
import { useTranslations } from 'next-intl';
import { type ReactNode, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Admin data table (docs/03_UI_Spec.md §7.19): TanStack Table (headless), 52 px rows, stacked label/value
 * cards below 768 px, optional row selection. Cells don't wrap; wide tables scroll horizontally (a sticky
 * header can't pin to the page from inside an overflow-x container, so none is used).
 */
export type Column<T> = {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
  /** hide in the mobile card view */
  desktopOnly?: boolean;
};

export function DataTable<T>({
  rows,
  columns,
  getRowId,
  selectable = false,
  onSelectionChange,
  empty,
  onRowClick,
}: {
  rows: T[];
  columns: Column<T>[];
  getRowId: (row: T) => string;
  selectable?: boolean;
  onSelectionChange?: (ids: string[]) => void;
  empty?: ReactNode;
  onRowClick?: (row: T) => void;
}) {
  const t = useTranslations('admin.table');
  const [selection, setSelection] = useState<RowSelectionState>({});
  const defs: ColumnDef<T>[] = [
    ...(selectable
      ? [
          {
            id: '__select',
            header: ({ table }) => (
              <input
                type="checkbox"
                aria-label={t('selectAll')}
                className="size-5 accent-primary"
                checked={table.getIsAllRowsSelected()}
                onChange={table.getToggleAllRowsSelectedHandler()}
              />
            ),
            cell: ({ row }) => (
              <input
                type="checkbox"
                aria-label={t('selectRow')}
                className="size-5 accent-primary"
                checked={row.getIsSelected()}
                onClick={(e) => e.stopPropagation()}
                onChange={row.getToggleSelectedHandler()}
              />
            ),
          } satisfies ColumnDef<T>,
        ]
      : []),
    ...columns.map((col) => ({ id: col.id, header: col.header, cell: ({ row }: { row: { original: T } }) => col.cell(row.original) }) as ColumnDef<T>),
  ];
  const table = useReactTable({
    data: rows,
    columns: defs,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    enableRowSelection: selectable,
    state: { rowSelection: selection },
    onRowSelectionChange: (updater) => {
      const next = typeof updater === 'function' ? updater(selection) : updater;
      setSelection(next);
      onSelectionChange?.(Object.keys(next).filter((id) => next[id]));
    },
  });

  if (rows.length === 0) return <div className="rounded-lg bg-surface shadow-sm">{empty}</div>;

  return (
    <>
      <div className="hidden overflow-x-auto rounded-lg bg-surface shadow-sm md:block">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-left text-xs font-semibold text-fg-muted">
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => (
                  <th key={header.id} scope="col" className="h-11 px-4 whitespace-nowrap">
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                className={cn('h-13 border-t border-border hover:bg-surface-2', row.getIsSelected() && 'bg-primary-soft', onRowClick && 'cursor-pointer')}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className={cn('px-4 py-2 align-middle whitespace-nowrap text-fg', columns.find((c) => c.id === cell.column.id)?.className)}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="flex flex-col gap-2 md:hidden">
        {table.getRowModel().rows.map((row) => (
          <li
            key={row.id}
            onClick={onRowClick ? () => onRowClick(row.original) : undefined}
            className={cn('rounded-lg bg-surface p-4 shadow-sm', row.getIsSelected() && 'ring-2 ring-primary')}
          >
            {selectable ? (
              <label className="mb-2 flex min-h-11 items-center gap-2 text-sm text-fg-muted" onClick={(e) => e.stopPropagation()}>
                <input type="checkbox" className="size-5 accent-primary" checked={row.getIsSelected()} onChange={row.getToggleSelectedHandler()} />
                {t('select')}
              </label>
            ) : null}
            <dl className="grid grid-cols-3 gap-x-3 gap-y-2">
              {columns
                .filter((c) => !c.desktopOnly)
                .map((col) => (
                  <div key={col.id} className="contents">
                    <dt className="text-xs text-fg-muted">{col.header}</dt>
                    <dd className="col-span-2 min-w-0 text-sm text-fg">{col.cell(row.original)}</dd>
                  </div>
                ))}
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}
