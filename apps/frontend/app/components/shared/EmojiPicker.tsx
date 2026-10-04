import Picker from "@emoji-mart/react";
import data from "@emoji-mart/data";

export default function EmojiPicker(props: React.ComponentProps<typeof Picker>) {
    return <Picker {...props} data={data} />;
}
