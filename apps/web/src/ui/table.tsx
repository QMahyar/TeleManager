import * as React from "react"

function TableWrap({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="table-wrap"
      className={["overflow-auto rounded-lg border border-border", className].filter(Boolean).join(" ")}
      {...props}
    />
  )
}

function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <table
      data-slot="table"
      className={["w-full text-left text-sm", className].filter(Boolean).join(" ")}
      {...props}
    />
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={[
        "sticky top-0 z-10 border-b border-border bg-card type-label text-muted-foreground",
        className
      ].filter(Boolean).join(" ")}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody data-slot="table-body" className={className} {...props} />
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={[
        "border-b border-border/60 transition-colors last:border-0 hover:bg-muted/30",
        className
      ].filter(Boolean).join(" ")}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={["px-3 py-2 font-medium", className].filter(Boolean).join(" ")}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td data-slot="table-cell" className={["px-3 py-2", className].filter(Boolean).join(" ")} {...props} />
  )
}

export {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableWrap,
}
