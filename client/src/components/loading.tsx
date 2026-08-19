export function Loading() {
  return (
    <div className="fixed inset-0 bg-background flex items-center justify-center z-50" dir="rtl">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-muted-foreground text-sm">جاري التحميل...</p>
      </div>
    </div>
  );
}
