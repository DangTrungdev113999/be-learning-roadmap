import { Link } from 'react-router-dom';

interface BreadcrumbItem {
  label: string;
  to: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

export function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <nav className="flex items-center gap-1 text-xs text-gh-text-secondary">
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <span key={item.to} className="flex items-center gap-1">
            {i > 0 && <span className="opacity-40">/</span>}
            {isLast ? (
              <span className="text-gh-text-primary">{item.label}</span>
            ) : (
              <Link to={item.to} className="text-gh-accent-blue hover:underline">
                {item.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
