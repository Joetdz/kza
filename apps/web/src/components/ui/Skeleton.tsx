export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

const Card = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`bg-surface rounded-2xl p-5 border border-line space-y-3 ${className}`}>{children}</div>
);

/** While a page's code loads: a title, a row of figures, a list — the shape most pages have. */
export function PageSkeleton() {
  return (
    <div className="space-y-6 animate-fade-in" aria-busy="true" aria-label="Chargement">
      <div className="space-y-2">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-7 w-28" />
          </Card>
        ))}
      </div>
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="p-4">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-6 w-20" />
            </div>
            <Skeleton className="h-3 w-2/3" />
          </Card>
        ))}
      </div>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Title */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-56" />
      </div>

      {/* KPI row 1 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-3 w-20" />
          </Card>
        ))}
      </div>

      {/* KPI row 2 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-3 w-16" />
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-52 w-full" />
        </Card>
        <Card>
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-52 w-52 rounded-full mx-auto" />
        </Card>
      </div>
    </div>
  );
}

export function CardsSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 animate-fade-in">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="p-4">
          <div className="flex items-center gap-3">
            <Skeleton className="w-12 h-12 rounded-xl" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: 3 }).map((_, j) => (
              <Skeleton key={j} className="h-16" />
            ))}
          </div>
          <Skeleton className="h-9 w-full" />
        </Card>
      ))}
    </div>
  );
}

export function ListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-3 animate-fade-in">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <Skeleton className="h-6 w-20" />
              <Skeleton className="h-6 w-16" />
            </div>
            <Skeleton className="h-7 w-24" />
          </div>
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </Card>
      ))}
    </div>
  );
}
