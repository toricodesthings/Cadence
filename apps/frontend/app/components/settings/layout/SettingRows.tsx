import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../primitives/Select";
import { Switch } from "../../primitives";
import { SettingsRow } from "./SettingsLayout";

export type SettingOption = { value: string; label: string };

export function SelectSetting({ title, description, value, options, onChange, widthClass = "sm:max-w-[18rem]" }: {
    title: string;
    description: string;
    value: string;
    options: SettingOption[];
    onChange: (value: string) => void;
    widthClass?: string;
}) {
    return (
        <SettingsRow title={title} description={description}>
            <div className={`w-full ${widthClass}`}>
                <Select value={value} onValueChange={onChange}>
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {options.map((o) => (
                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
        </SettingsRow>
    );
}

export function SwitchSetting({ title, description, checked, onChange }: {
    title: string;
    description: string;
    checked: boolean;
    onChange: (value: boolean) => void;
}) {
    return (
        <SettingsRow title={title} description={description}>
            <Switch checked={checked} onCheckedChange={onChange} />
        </SettingsRow>
    );
}
