"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { SearchSelect, type SearchSelectOption } from "@/components/search-select";
import { Field } from "@/components/ui";

type BankName = { name: string; suggested: "frequent" | "popular" | null };
type Branch = { ifsc: string; branch: string; city: string; state: string };
const OTHER_BANK = "__OTHER_BANK__";

export function BankIfscPicker({
  bankName, ifsc, onBankChange, onIfscChange,
}: {
  bankName: string;
  ifsc: string;
  onBankChange: (name: string) => void;
  onIfscChange: (ifsc: string) => void;
}) {
  const [banks, setBanks] = useState<BankName[]>([]);
  const [bankLoadFailed, setBankLoadFailed] = useState(false);
  const [manualBank, setManualBank] = useState(false);
  const [manualIfsc, setManualIfsc] = useState(false);
  const [branchQuery, setBranchQuery] = useState("");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchLoading, setBranchLoading] = useState(false);
  const [branchFailed, setBranchFailed] = useState(false);

  useEffect(() => {
    let active = true;
    apiFetch<BankName[]>("/customers/bank-directory")
      .then((result) => { if (active) setBanks(result); })
      .catch(() => { if (active) setBankLoadFailed(true); });
    return () => { active = false; };
  }, []);

  const inDirectory = banks.some((bank) => bank.name === bankName);
  useEffect(() => {
    if (!inDirectory || branchQuery.trim().length === 1) {
      setBranches([]);
      setBranchLoading(false);
      setBranchFailed(false);
      return;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      setBranchLoading(true);
      setBranchFailed(false);
      apiFetch<Branch[]>("/customers/bank-directory/branches?bank=" +
        encodeURIComponent(bankName) + "&q=" + encodeURIComponent(branchQuery.trim()))
        .then((result) => { if (active) setBranches(result); })
        .catch(() => { if (active) { setBranches([]); setBranchFailed(true); } })
        .finally(() => { if (active) setBranchLoading(false); });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [bankName, branchQuery, inDirectory]);

  const bankOptions = useMemo<SearchSelectOption[]>(() => {
    const options: SearchSelectOption[] = banks.map((bank) => ({ value: bank.name, label: bank.name, description: bank.suggested === "frequent" ? "Frequently used" : bank.suggested === "popular" ? "Popular bank" : undefined }));
    if (bankName && !inDirectory) options.unshift({ value: bankName, label: bankName });
    options.push({ value: OTHER_BANK, label: "Bank not listed — type manually" });
    return options;
  }, [banks, bankName, inDirectory]);

  const branchOptions = useMemo<SearchSelectOption[]>(() => {
    const options: SearchSelectOption[] = branches.map((branch) => ({
      value: branch.ifsc,
      label: branch.ifsc + " · " + branch.branch + ", " + branch.city,
      description: branch.ifsc + (branch.state ? " · " + branch.state : ""),
      searchText: [branch.ifsc, branch.branch, branch.city, branch.state].join(" "),
    }));
    if (ifsc && !options.some((option) => option.value === ifsc)) {
      options.unshift({ value: ifsc, label: ifsc, description: "Currently saved IFSC" });
    }
    return options;
  }, [branches, ifsc]);

  function selectBank(selected: string) {
    setBranches([]);
    setBranchQuery("");
    setBranchFailed(false);
    onIfscChange("");
    if (selected === OTHER_BANK) {
      setManualBank(true);
      onBankChange("");
      setManualIfsc(true);
    } else {
      setManualBank(false);
      setManualIfsc(false);
      onBankChange(selected);
    }
  }

  return <>
    <Field label="Bank name">
      {manualBank || bankLoadFailed ? <>
        <input className="app-control" value={bankName} onChange={(event) => { onBankChange(event.target.value); onIfscChange(""); }} placeholder="Enter bank name" required />
        {!bankLoadFailed ? <button type="button" className="mt-1 text-xs font-semibold text-indigo-700" onClick={() => { setManualBank(false); onBankChange(""); onIfscChange(""); setManualIfsc(false); }}>Choose from bank list</button> : <p className="mt-1 text-xs text-amber-700">Bank directory unavailable. Enter the bank and IFSC manually.</p>}
      </> : <SearchSelect value={bankName} onChange={selectBank} options={bankOptions} placeholder="Select bank" searchPlaceholder="Search Indian banks…" emptyText="Bank not found — choose manual entry" />}
    </Field>
    <Field label="Branch / IFSC">
      {manualIfsc || manualBank || bankLoadFailed || (bankName !== "" && !inDirectory) ? <>
        <input name="cashledger_i_f_s_c" autoComplete="on" className="app-control uppercase" value={ifsc} onChange={(event) => onIfscChange(event.target.value.toUpperCase().replace(/\s/g, "").slice(0, 11))} maxLength={11} pattern="[A-Z]{4}0[A-Z0-9]{6}" title="Enter an 11-character IFSC, such as HDFC0001234" placeholder="Enter IFSC (optional)" />
        {!manualBank && !bankLoadFailed && inDirectory ? <button type="button" className="mt-1 text-xs font-semibold text-indigo-700" onClick={() => { setManualIfsc(false); onIfscChange(""); }}>Choose branch instead</button> : null}
      </> : <>
        <SearchSelect value={ifsc} onChange={onIfscChange} onSearchChange={setBranchQuery}
          options={branchOptions} disabled={!bankName} placeholder={bankName ? "Select branch / IFSC" : "Choose bank first"}
          searchPlaceholder="Search branch, city or IFSC…"
          emptyText={branchLoading ? "Searching branches…" : branchFailed ? "Directory unavailable — use manual IFSC" : branchQuery.trim().length < 2 ? "Type 2+ characters to find a branch" : "No matching branch. Try city or IFSC."} />
        <button type="button" className="mt-1 text-xs font-semibold text-indigo-700" onClick={() => setManualIfsc(true)}>IFSC not listed? Enter manually</button>
      </>}
    </Field>
  </>;
}
