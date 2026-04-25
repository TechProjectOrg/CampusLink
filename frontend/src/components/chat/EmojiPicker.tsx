import ReactEmojiPicker, {
  Categories,
  EmojiClickData,
  EmojiStyle,
  SkinTonePickerLocation,
  SuggestionMode,
  Theme,
} from 'emoji-picker-react';

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  compact?: boolean;
}

export function EmojiPicker({ onSelect, compact = false }: EmojiPickerProps) {
  const width = compact ? 330 : 390;
  const height = compact ? 270 : 292;

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    onSelect(emojiData.emoji);
  };

  return (
    <div className="chat-emoji-picker">
      <ReactEmojiPicker
        className="chat-epr-main"
        width={width}
        height={height}
        theme={Theme.LIGHT}
        emojiStyle={EmojiStyle.APPLE}
        lazyLoadEmojis
        autoFocusSearch={false}
        skinTonesDisabled
        skinTonePickerLocation={SkinTonePickerLocation.SEARCH}
        suggestedEmojisMode={SuggestionMode.RECENT}
        previewConfig={{ showPreview: false }}
        searchPlaceholder="Search emoji"
        categories={[
          { category: Categories.SUGGESTED, name: 'Recently Used' },
          { category: Categories.SMILEYS_PEOPLE, name: 'Smileys & People' },
          { category: Categories.ANIMALS_NATURE, name: 'Animals & Nature' },
          { category: Categories.FOOD_DRINK, name: 'Food & Drink' },
          { category: Categories.TRAVEL_PLACES, name: 'Travel & Places' },
          { category: Categories.ACTIVITIES, name: 'Activities' },
          { category: Categories.OBJECTS, name: 'Objects' },
          { category: Categories.SYMBOLS, name: 'Symbols' },
          { category: Categories.FLAGS, name: 'Flags' },
        ]}
        onEmojiClick={handleEmojiClick}
        style={{
          border: '0',
          boxShadow: 'none',
          ['--epr-picker-border-radius' as string]: '16px',
          ['--epr-emoji-size' as string]: '30px',
          ['--epr-emoji-padding' as string]: '5px',
          ['--epr-category-navigation-button-size' as string]: '32px',
          ['--epr-header-padding' as string]: '10px',
          ['--epr-horizontal-padding' as string]: '10px',
          ['--epr-search-input-height' as string]: '38px',
        }}
      />
    </div>
  );
}
