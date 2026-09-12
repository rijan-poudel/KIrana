"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  BookOpen,
  History,
  Loader2,
  MapPin,
  MoreVertical,
  Pencil,
  Phone,
  Search,
  Trash2,
  UserPlus,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CustomerOption, HistoryEntry } from "@/lib/types";
import { formatDateTime, formatNPR, formatQuantity } from "@/lib/format";
import { createCustomer, deleteCustomer, getCustomerHistory, recordPayment, updateCustomer } from "@/actions/shop-actions";

export default function KhataClient({ customers }: { customers: CustomerOption[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [formTarget, setFormTarget] = useState<{ mode: "new" } | { mode: "edit"; customer: CustomerOption } | null>(null);
  const [historyFor, setHistoryFor] = useState<CustomerOption | null>(null);
  const [paymentFor, setPaymentFor] = useState<CustomerOption | null>(null);
  const [deleteFor, setDeleteFor] = useState<CustomerOption | null>(null);

  const term = query.trim().toLowerCase();
  const filtered = term
    ? customers.filter(
        (c) =>
          c.name.toLowerCase().includes(term) ||
          (c.phone ?? "").toLowerCase().includes(term) ||
          c.address.toLowerCase().includes(term),
      )
    : customers;

  const totalOutstanding = customers.reduce((sum, c) => sum + Math.max(c.currentBalance, 0), 0);
  const withDues = customers.filter((c) => c.currentBalance > 0).length;

  async function handleDelete() {
    if (!deleteFor) return;
    const response = await deleteCustomer(deleteFor.id);
    if (response.ok) {
      toast.success(`${deleteFor.name} removed from the khata.`);
      setDeleteFor(null);
      router.refresh();
    } else {
      toast.error(response.error);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground md:text-3xl">Udharo Khata</h1>
          <p className="mt-1 text-muted-foreground">
            {customers.length} customers • {withDues} with outstanding credit
          </p>
        </div>
        <Button size="lg" onClick={() => setFormTarget({ mode: "new" })}>
          <UserPlus /> Add Customer
        </Button>
      </header>

      <div className="card mt-5 flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-50 text-red-600">
            <Wallet size={22} />
          </span>
          <div>
            <p className="text-sm font-semibold text-muted-foreground">Total outstanding udharo</p>
            <p className="text-2xl font-bold text-red-600">{formatNPR(totalOutstanding)}</p>
          </div>
        </div>
      </div>

      <div className="relative mt-4">
        <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          type="text"
          placeholder="Search by name, phone or address…"
          className="pl-10"
          aria-label="Search customers"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="card mt-4 flex flex-col items-center gap-2 p-10 text-center">
          <BookOpen size={32} className="text-muted-foreground/50" />
          <p className="text-sm font-medium text-muted-foreground">
            {customers.length === 0
              ? "No customers on the khata yet. Add one, or record a credit sale from the Counter."
              : "No customers match your search."}
          </p>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((customer) => (
            <div key={customer.id} className="card flex flex-col p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-base font-bold text-foreground">{customer.name}</p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                    <Phone size={12} /> {customer.phone ?? "No phone"}
                  </p>
                  {customer.address && (
                    <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                      <MapPin size={12} /> {customer.address}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <BalanceBadge balance={customer.currentBalance} />
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button variant="ghost" size="icon-sm" aria-label={`Manage ${customer.name}`}>
                          <MoreVertical />
                        </Button>
                      }
                    />
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setFormTarget({ mode: "edit", customer })}>
                        <Pencil /> Edit customer
                      </DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" onClick={() => setDeleteFor(customer)}>
                        <Trash2 /> Delete customer
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              <div className="mt-3 flex gap-2 pt-1">
                <Button variant="outline" className="h-11 flex-1" onClick={() => setHistoryFor(customer)}>
                  <History /> History
                </Button>
                <Button className="h-11 flex-1" onClick={() => setPaymentFor(customer)}>
                  <Wallet /> Record Payment
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {formTarget && (
        <CustomerFormDialog
          customer={formTarget.mode === "edit" ? formTarget.customer : null}
          onClose={() => setFormTarget(null)}
        />
      )}
      {historyFor && <HistoryDialog customer={historyFor} onClose={() => setHistoryFor(null)} />}
      {paymentFor && <PaymentDialog customer={paymentFor} onClose={() => setPaymentFor(null)} />}

      <Dialog open={!!deleteFor} onOpenChange={(next) => !next && setDeleteFor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove {deleteFor?.name} from the khata?</DialogTitle>
            <DialogDescription>
              Customers with outstanding dues or past bills cannot be removed. Their purchase history stays in the
              reports either way.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteFor(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 /> Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BalanceBadge({ balance }: { balance: number }) {
  if (balance > 0) return <Badge variant="destructive">Owes {formatNPR(balance)}</Badge>;
  if (balance < 0) return <Badge variant="info">Advance {formatNPR(-balance)}</Badge>;
  return <Badge variant="success">No dues</Badge>;
}

/* ------------------------------------------------------------------ */

function CustomerFormDialog({ customer, onClose }: { customer: CustomerOption | null; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(customer?.name ?? "");
  const [phone, setPhone] = useState(customer?.phone ?? "");
  const [address, setAddress] = useState(customer?.address ?? "");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    const input = { name, phone, address };
    const response = customer ? await updateCustomer(customer.id, input) : await createCustomer(input);
    setSubmitting(false);
    if (response.ok) {
      toast.success(customer ? `${name.trim()} updated.` : `${name.trim()} added to the khata.`);
      router.refresh();
      onClose();
    } else {
      toast.error(response.error);
    }
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{customer ? `Edit ${customer.name}` : "Add Customer"}</DialogTitle>
          <DialogDescription>
            {customer
              ? "Fix the name, phone or ward — the khata balance only moves through sales and payments."
              : "Customers are only needed for udharo (credit) sales."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label htmlFor="c-name">Customer name *</Label>
            <Input
              id="c-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Ram Bahadur Gurung"
              required
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="c-phone">Phone</Label>
              <Input
                id="c-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                inputMode="tel"
                placeholder="98-XXXXXXXX"
              />
            </div>
            <div>
              <Label htmlFor="c-address">Ward / area</Label>
              <Input
                id="c-address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="e.g., Gaindakot Ward No. 5"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Loader2 className="animate-spin" /> : null}
              {customer ? "Save changes" : "Add Customer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */

function HistoryDialog({ customer, onClose }: { customer: CustomerOption; onClose: () => void }) {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getCustomerHistory(customer.id).then((response) => {
      if (cancelled) return;
      if (response.ok) setEntries(response.data);
      else setError(response.error);
    });
    return () => {
      cancelled = true;
    };
  }, [customer.id]);

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{customer.name}</DialogTitle>
          <DialogDescription>
            {customer.phone ?? "No phone"}
            {customer.address ? ` • ${customer.address}` : ""}
          </DialogDescription>
          <div className="mt-1">
            <BalanceBadge balance={customer.currentBalance} />
          </div>
        </DialogHeader>

        <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-700">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}
          {!error && entries === null && (
            <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
              <Loader2 size={20} className="animate-spin" /> Loading history…
            </div>
          )}
          {entries !== null && entries.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">No transactions yet for this customer.</p>
          )}
          {entries !== null &&
            entries.map((entry) => {
              const isPayment = entry.type === "PAYMENT";
              return (
                <div key={entry.id} className="rounded-xl border border-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant={isPayment ? "success" : entry.type === "WHOLESALE" ? "info" : "muted"}>
                        {isPayment ? "PAYMENT" : entry.type === "WHOLESALE" ? "WHOLESALE SALE" : "RETAIL SALE"}
                      </Badge>
                      {!isPayment && (
                        <Badge
                          variant={
                            entry.paymentStatus === "PAID"
                              ? "success"
                              : entry.paymentStatus === "PARTIAL"
                                ? "warning"
                                : "destructive"
                          }
                        >
                          {entry.paymentStatus}
                        </Badge>
                      )}
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(entry.createdAt)}</span>
                  </div>

                  {isPayment ? (
                    <p className="mt-2 text-sm font-semibold text-emerald-700">
                      + {formatNPR(entry.totalAmount)} paid towards khata
                    </p>
                  ) : (
                    <>
                      <ul className="mt-2 space-y-0.5">
                        {entry.items.map((item, index) => (
                          <li key={index} className="text-xs text-muted-foreground">
                            {formatQuantity(item.quantity)} {item.unitName || item.baseUnit} × {item.productName} @{" "}
                            {formatNPR(item.unitPrice)} = <span className="font-semibold">{formatNPR(item.subtotal)}</span>
                          </li>
                        ))}
                      </ul>
                      <div className="mt-2 flex justify-between text-sm">
                        <span className="font-semibold text-foreground">Total {formatNPR(entry.totalAmount)}</span>
                        <span className="text-muted-foreground">
                          Paid {formatNPR(entry.paidAmount)}
                          {entry.totalAmount - entry.paidAmount > 0 && (
                            <span className="ml-1 font-semibold text-red-600">
                              (due {formatNPR(entry.totalAmount - entry.paidAmount)})
                            </span>
                          )}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
        </div>

        <DialogFooter>
          <Button variant="outline" className="w-full" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */

function PaymentDialog({ customer, onClose }: { customer: CustomerOption; onClose: () => void }) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [newBalance, setNewBalance] = useState<number | null>(null);

  const outstanding = customer.currentBalance;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const value = Number.parseFloat(amount);
    if (Number.isNaN(value) || value <= 0) {
      setError("Enter the cash amount the customer paid.");
      return;
    }
    setSubmitting(true);
    const response = await recordPayment({ customerId: customer.id, amount: value });
    setSubmitting(false);
    if (response.ok) {
      // The list behind this dialog and the day report update immediately —
      // waiting for the user to close the modal would show a stale balance.
      router.refresh();
      setNewBalance(response.data.newBalance);
    } else {
      setError(response.error);
    }
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        {newBalance === null ? (
          <>
            <DialogHeader>
              <DialogTitle>Record Payment</DialogTitle>
              <DialogDescription>Cash received from {customer.name} towards their khata.</DialogDescription>
              <div className="mt-1">
                <BalanceBadge balance={outstanding} />
              </div>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <Label htmlFor="pay-amount">Cash received (Rs.) *</Label>
                <Input
                  id="pay-amount"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="text-xl"
                  placeholder="0.00"
                  autoFocus
                  required
                />
                {outstanding > 0 && (
                  <button
                    type="button"
                    onClick={() => setAmount(String(outstanding))}
                    className="mt-2 text-sm font-semibold text-emerald-700 hover:underline"
                  >
                    Pay full outstanding ({formatNPR(outstanding)})
                  </button>
                )}
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-700">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                  {error}
                </div>
              )}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? <Loader2 className="animate-spin" /> : null} Save Payment
                </Button>
              </DialogFooter>
            </form>
          </>
        ) : (
          <div className="py-4 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <Wallet size={28} />
            </div>
            <h2 className="mt-3 text-xl font-bold text-foreground">Payment Recorded</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {formatNPR(Number.parseFloat(amount) || 0)} received from {customer.name}.
            </p>
            <p className="mt-3 text-lg text-foreground">
              New balance:{" "}
              <strong className={newBalance > 0 ? "text-red-600" : "text-emerald-700"}>
                {newBalance > 0 ? formatNPR(newBalance) : newBalance < 0 ? `Advance ${formatNPR(-newBalance)}` : "Clear — no dues"}
              </strong>
            </p>
            <Button onClick={onClose} className="mt-5 w-full">
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
