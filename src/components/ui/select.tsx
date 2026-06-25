'use client';

import * as React from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverTrigger, PopoverContent } from './popover';
import { Input } from './input';
import { Button } from './button';

interface SelectContextType {
  value: string;
  onValueChange: (value: string) => void;
  search: string;
  setSearch: (search: string) => void;
  registerItem: (value: string, label: string) => () => void;
  items: Map<string, string>;
  open: boolean;
  setOpen: (open: boolean) => void;
  showSearch?: boolean;
  searchThreshold: number;
  disabled?: boolean;
}

const SelectContext = React.createContext<SelectContextType | null>(null);

export function Select({
  children,
  value,
  onValueChange,
  defaultValue,
  open: openProp,
  onOpenChange,
  showSearch,
  searchThreshold = 10,
  disabled,
}: {
  children: React.ReactNode;
  value?: string;
  onValueChange?: (value: any) => void;
  defaultValue?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  showSearch?: boolean;
  searchThreshold?: number;
  disabled?: boolean;
}) {
  const [open, setOpen] = React.useState(openProp || false);
  const [selectedValue, setSelectedValue] = React.useState(defaultValue || '');
  const [search, setSearch] = React.useState('');
  const [items, setItems] = React.useState<Map<string, string>>(new Map());

  React.useEffect(() => {
    if (openProp !== undefined) setOpen(openProp);
  }, [openProp]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (disabled) return;
    setOpen(nextOpen);
    onOpenChange?.(nextOpen);
    if (!nextOpen) {
      setSearch('');
    }
  };

  const handleValueChange = (val: string) => {
    setSelectedValue(val);
    onValueChange?.(val);
    setOpen(false);
    setSearch('');
  };

  const registerItem = React.useCallback((val: string, label: string) => {
    setItems((prev) => {
      if (prev.get(val) === label) return prev;
      const next = new Map(prev);
      next.set(val, label);
      return next;
    });
    return () => {
      setItems((prev) => {
        if (!prev.has(val)) return prev;
        const next = new Map(prev);
        next.delete(val);
        return next;
      });
    };
  }, []);

  const activeValue = value !== undefined ? value : selectedValue;

  return (
    <SelectContext.Provider
      value={{
        value: activeValue,
        onValueChange: handleValueChange,
        search,
        setSearch,
        registerItem,
        items,
        open,
        setOpen: handleOpenChange,
        showSearch,
        searchThreshold,
        disabled,
      }}
    >
      <Popover open={open} onOpenChange={handleOpenChange}>
        {children}
      </Popover>
    </SelectContext.Provider>
  );
}

const SelectTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<typeof Button>
>(({ className, children, ...props }, ref) => {
  const context = React.useContext(SelectContext);
  const disabled = props.disabled || context?.disabled;

  return (
    <PopoverTrigger asChild disabled={disabled}>
      <Button
        ref={ref}
        variant="outline"
        role="combobox"
        className={cn(
          'flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1',
          className
        )}
        disabled={disabled}
        {...props}
      >
        {children}
        <ChevronDown className="h-4 w-4 opacity-50 shrink-0 ml-2" />
      </Button>
    </PopoverTrigger>
  );
});
SelectTrigger.displayName = 'SelectTrigger';

function SelectValue({ placeholder }: { placeholder?: string }) {
  const context = React.useContext(SelectContext);
  if (!context) return null;
  const label = context.items.get(context.value) || placeholder || context.value;
  return <span className="pointer-events-none">{label}</span>;
}
SelectValue.displayName = 'SelectValue';

const SelectContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof PopoverContent>
>(({ className, children, ...props }, ref) => {
  const context = React.useContext(SelectContext);
  if (!context) return null;

  const showSearch =
    context.showSearch !== undefined
      ? context.showSearch
      : context.items.size > context.searchThreshold;

  return (
    <PopoverContent
      ref={ref}
      className={cn(
        'w-[var(--radix-popover-trigger-width)] min-w-[8rem] p-1 flex flex-col',
        className
      )}
      {...props}
    >
      {showSearch && (
        <div className="px-2 py-1.5 border-b border-border/60">
          <Input
            type="text"
            placeholder="Search..."
            value={context.search}
            onChange={(e) => context.setSearch(e.target.value)}
            className="h-8 text-xs px-2"
            autoFocus
          />
        </div>
      )}
      <div className="max-h-60 overflow-y-auto overflow-x-hidden p-1 space-y-0.5">
        {children}
      </div>
    </PopoverContent>
  );
});
SelectContent.displayName = 'SelectContent';

const SelectItem = React.forwardRef<
  HTMLButtonElement,
  {
    value: string;
    children: React.ReactNode;
    className?: string;
  }
>(({ className, value, children, ...props }, ref) => {
  const context = React.useContext(SelectContext);
  if (!context) return null;

  const label = React.useMemo(() => {
    if (typeof children === 'string') return children;
    return String(children);
  }, [children]);

  React.useEffect(() => {
    return context.registerItem(value, label);
  }, [value, label, context.registerItem]);

  const isSelected = context.value === value;

  const matchesSearch =
    !context.search ||
    label.toLowerCase().includes(context.search.toLowerCase());

  if (!matchesSearch) return null;

  return (
    <button
      ref={ref}
      type="button"
      role="option"
      aria-selected={isSelected}
      onClick={() => context.onValueChange(value)}
      className={cn(
        'relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 text-left',
        isSelected && 'bg-accent/50 font-medium',
        className
      )}
      {...props}
    >
      <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
        {isSelected && <Check className="h-4 w-4" />}
      </span>
      {children}
    </button>
  );
});
SelectItem.displayName = 'SelectItem';

function SelectGroup({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('space-y-0.5', className)} {...props}>
      {children}
    </div>
  );
}
SelectGroup.displayName = 'SelectGroup';

function SelectLabel({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('px-2 py-1.5 text-xs font-semibold text-muted-foreground', className)} {...props}>
      {children}
    </div>
  );
}
SelectLabel.displayName = 'SelectLabel';

function SelectSeparator({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('-mx-1 my-1 h-px bg-muted', className)} {...props} />
  );
}
SelectSeparator.displayName = 'SelectSeparator';

const SelectScrollUpButton = () => null;
const SelectScrollDownButton = () => null;

export {
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectGroup,
  SelectLabel,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
};
