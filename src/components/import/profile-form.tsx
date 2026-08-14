import { createFileImportProfileAction } from "@/app/actions";
import { SettingsActionForm } from "@/components/forms/settings-action-form";

export function FileImportProfileForm({
  accounts,
  defaultTimeZone,
  defaultAccountId,
}: {
  accounts: Array<{ id: string; name: string; assetCode: string }>;
  defaultTimeZone: string;
  defaultAccountId?: string;
}) {
  return (
    <SettingsActionForm
      action={createFileImportProfileAction}
      className="file-profile-form"
      submitLabel="Create explicit import profile"
    >
      <div className="field-grid field-grid-two">
        <label className="field">
          <span>Target account</span>
          <select
            defaultValue={defaultAccountId ?? ""}
            name="targetAccountId"
            required
          >
            <option value="">请选择账户</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name} · {account.assetCode}
              </option>
            ))}
          </select>
          <small>Immutable. Changing account requires a new profile.</small>
        </label>
        <label className="field">
          <span>Profile name</span>
          <input name="name" placeholder="例如：Wise USD monthly" required />
        </label>
        <label className="field">
          <span>Statement format</span>
          <select defaultValue="csv" name="format">
            <option value="csv">CSV</option>
            <option value="ofx">OFX banking / credit card</option>
            <option value="qfx">QFX banking / credit card</option>
            <option value="camt053">ISO 20022 camt.053</option>
          </select>
        </label>
        <label className="field">
          <span>Date-only timezone</span>
          <input defaultValue={defaultTimeZone} name="timezone" required />
          <small>Date-only rows use local 12:00, then canonical UTC.</small>
        </label>
      </div>

      <details className="csv-profile-mapping" open>
        <summary>CSV mapping · used only when format is CSV</summary>
        <div className="field-grid field-grid-three">
          <label className="field">
            <span>Encoding</span>
            <select defaultValue="utf-8" name="encoding">
              <option value="utf-8">UTF-8</option>
              <option value="windows-1252">Windows-1252</option>
              <option value="gb18030">GB18030</option>
            </select>
          </label>
          <label className="field">
            <span>Delimiter</span>
            <select defaultValue="," name="delimiter">
              <option value=",">Comma</option>
              <option value=";">Semicolon</option>
              <option value={"\t"}>Tab</option>
            </select>
          </label>
          <label className="field">
            <span>Date format</span>
            <select defaultValue="YYYY-MM-DD" name="dateFormat">
              {[
                "YYYY-MM-DD",
                "YYYY/MM/DD",
                "YYYYMMDD",
                "DD/MM/YYYY",
                "MM/DD/YYYY",
                "DD.MM.YYYY",
              ].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Date column</span>
            <input defaultValue="Date" name="dateColumn" required />
          </label>
          <label className="field">
            <span>Optional time column</span>
            <input name="timeColumn" placeholder="Time" />
          </label>
          <label className="field">
            <span>Optional time format</span>
            <select defaultValue="" name="timeFormat">
              <option value="">No time column</option>
              <option value="HH:mm">HH:mm</option>
              <option value="HH:mm:ss">HH:mm:ss</option>
            </select>
          </label>
          <label className="field">
            <span>Amount mode</span>
            <select defaultValue="signed" name="amountMode">
              <option value="signed">Signed amount</option>
              <option value="debit_credit">Debit + credit columns</option>
            </select>
          </label>
          <label className="field">
            <span>Signed amount column</span>
            <input defaultValue="Amount" name="amountColumn" />
          </label>
          <label className="field">
            <span>Debit / credit columns</span>
            <span className="inline-column-pair">
              <input defaultValue="Debit" name="debitColumn" />
              <input defaultValue="Credit" name="creditColumn" />
            </span>
          </label>
          <label className="field">
            <span>Decimal separator</span>
            <select defaultValue="." name="decimalSeparator">
              <option value=".">Dot</option>
              <option value=",">Comma</option>
            </select>
          </label>
          <label className="field">
            <span>Thousands separator</span>
            <select defaultValue="" name="thousandsSeparator">
              <option value="">None</option>
              <option value=",">Comma</option>
              <option value=".">Dot</option>
              <option value=" ">Space</option>
            </select>
          </label>
          <label className="field">
            <span>ID / payee / memo / currency</span>
            <span className="inline-column-pair">
              <input defaultValue="ID" name="idColumn" />
              <input defaultValue="Payee" name="payeeColumn" />
              <input defaultValue="Memo" name="memoColumn" />
              <input defaultValue="Currency" name="currencyColumn" />
            </span>
          </label>
        </div>
        <div className="csv-profile-options">
          <label className="checkbox-row">
            <input defaultChecked name="hasHeader" type="checkbox" />
            <span>First row is a header</span>
          </label>
          <label className="checkbox-row">
            <input name="invertSign" type="checkbox" />
            <span>Explicitly invert statement signs</span>
          </label>
        </div>
      </details>
    </SettingsActionForm>
  );
}
