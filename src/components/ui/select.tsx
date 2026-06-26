'use client';

import * as React from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverTrigger, PopoverContent } from './popover';
import { Input } from './input';
import { Button } from './button';

const extractText = (node: React.ReactNode): string => {
  if (node === null || node === undefined) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) {
    return node.map(extractText).join('');
  }
  if (React.isValidElement(node)) {
    const props = node.props as any;
    if (props && props.children) {
      return extractText(props.children);
    }
  }
  return '';
};

const extractItems = (children: React.ReactNode, map: Map<string, string>) => {
  React.Children.forEach(children, (child) => {
    if (React.isValidElement(child)) {
      const type = child.type as any;
      if (type && (type.displayName === 'SelectItem' || type.name === 'SelectItem')) {
        const props = child.props as any;
        const value = props.value;
        const label = extractText(props.children);
        map.set(value, label);
      } else {
        const props = child.props as any;
        if (props && props.children) {
          extractItems(props.children, map);
        }
      }
    }
  });
};

interface SelectContextType {
  value: string;
  onValueChange: (value: string) => void;
  search: string;
  setSearch: (search: string) => void;
  items: Map<string, string>;
  filteredItems: { value: string; label: string }[];
  highlightedValue: string;
  setHighlightedValue: (val: string) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  showSearch?: boolean;
  searchThreshold: number;
  disabled?: boolean;
  handleKeyDown: (e: React.KeyboardEvent) => void;
}

const SelectContext = React.createContext<SelectContextType | null>(null);

function Select({
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
  const [highlightedValue, setHighlightedValue] = React.useState('');

  const items = React.useMemo(() => {
    const map = new Map<string, string>();
    extractItems(children, map);
    return map;
  }, [children]);

  const filteredItems = React.useMemo(() => {
    return Array.from(items.entries())
      .map(([value, label]) => ({ value, label }))
      .filter((item) =>
        !search || item.label.toLowerCase().includes(search.toLowerCase())
      );
  }, [items, search]);

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

  const activeValue = value !== undefined ? value : selectedValue;

  React.useEffect(() => {
    if (open) {
      const exists = filteredItems.some((item) => item.value === activeValue);
      setHighlightedValue(exists ? activeValue : filteredItems[0]?.value || '');
    }
  }, [open, activeValue, filteredItems]);

  const handleKeyDown = React.useCallback((e: React.KeyboardEvent) => {
    if (filteredItems.length === 0) return;

    const currentIndex = filteredItems.findIndex((item) => item.value === highlightedValue);

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault();
        const nextIndex = currentIndex + 1 >= filteredItems.length ? 0 : currentIndex + 1;
        setHighlightedValue(filteredItems[nextIndex].value);
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        const prevIndex = currentIndex - 1 < 0 ? filteredItems.length - 1 : currentIndex - 1;
        setHighlightedValue(filteredItems[prevIndex].value);
        break;
      }
      case 'Enter': {
        e.preventDefault();
        if (currentIndex !== -1) {
          handleValueChange(filteredItems[currentIndex].value);
        }
        break;
      }
      default:
        break;
    }
  }, [filteredItems, highlightedValue]);

  return (
    <SelectContext.Provider
      value={{
        value: activeValue,
        onValueChange: handleValueChange,
        search,
        setSearch,
        items,
        filteredItems,
        highlightedValue,
        setHighlightedValue,
        open,
        setOpen: handleOpenChange,
        showSearch,
        searchThreshold,
        disabled,
        handleKeyDown,
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
>(({ className, children, onKeyDown, ...props }, ref) => {
  const context = React.useContext(SelectContext);
  const disabled = props.disabled || context?.disabled;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    onKeyDown?.(e);
    if (e.defaultPrevented) return;
    if (disabled) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      context?.setOpen(true);
    }
  };

  return (
    <PopoverTrigger asChild disabled={disabled}>
      <Button
        ref={ref}
        variant="outline"
        role="combobox"
        className={cn(
          'flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1',
          className
        )}
        disabled={disabled}
        onKeyDown={handleKeyDown}
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
      onKeyDown={context.handleKeyDown}
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

  const label = React.useMemo(() => {
    return extractText(children);
  }, [children]);

  const isSelected = context ? context.value === value : false;
  const isHighlighted = context ? context.highlightedValue === value : false;

  const matchesSearch = context
    ? !context.search || label.toLowerCase().includes(context.search.toLowerCase())
    : true;

  const buttonRef = React.useRef<HTMLButtonElement | null>(null);

  const handleRef = React.useCallback(
    (node: HTMLButtonElement | null) => {
      buttonRef.current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) (ref as any).current = node;
    },
    [ref]
  );

  React.useEffect(() => {
    if (isHighlighted && buttonRef.current) {
      buttonRef.current.scrollIntoView({
        block: 'nearest',
      });
      // Focus the button if search input is not focused
      const activeEl = document.activeElement;
      const isInputFocused = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');
      if (!isInputFocused) {
        buttonRef.current.focus();
      }
    }
  }, [isHighlighted]);

  if (!context) return null;
  if (!matchesSearch) return null;

  return (
    <button
      ref={handleRef}
      type="button"
      role="option"
      tabIndex={-1}
      aria-selected={isSelected}
      onClick={() => context.onValueChange(value)}
      onMouseEnter={() => context.setHighlightedValue(value)}
      onFocus={() => context.setHighlightedValue(value)}
      className={cn(
        'relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 text-left transition-colors duration-150',
        isSelected && 'bg-accent/40 font-medium',
        isHighlighted && 'bg-accent text-accent-foreground',
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
  Select,
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
