interface PageHeaderProps {
  title: string;
  subtitle?: string;
}

export function PageHeader({ title, subtitle }: PageHeaderProps) {
  return (
    <div className="mb-7">
      <h1 className="text-2xl font-bold tracking-tight gradient-text inline-block">{title}</h1>
      {subtitle && <p className="text-muted-foreground mt-1.5 text-sm">{subtitle}</p>}
    </div>
  );
}
