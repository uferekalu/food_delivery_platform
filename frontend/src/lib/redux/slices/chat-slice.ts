import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

// Support chat widget (docs/ROADMAP.md FDP-106) — one exchange, shown as two bubbles (the
// visitor's question, then the bot's answer) in the panel's message list.
export interface ChatMessageView {
  id: string;
  question: string;
  answer: string;
  matched: boolean;
  createdAt: string;
}

interface ChatState {
  messages: ChatMessageView[];
  open: boolean;
  /** Shown as a small badge on the collapsed icon — cleared the instant the panel opens. Set
   * once, after the initial history fetch comes back genuinely empty (a fresh visitor who's
   * never used the widget before, not a returning one with prior messages who already knows it
   * exists). */
  unread: boolean;
  historyChecked: boolean;
}

const initialState: ChatState = {
  messages: [],
  open: false,
  unread: false,
  historyChecked: false,
};

const chatSlice = createSlice({
  name: "chat",
  initialState,
  reducers: {
    panelOpened(state) {
      state.open = true;
      state.unread = false;
    },
    panelClosed(state) {
      state.open = false;
    },
    historyLoaded(state, action: PayloadAction<ChatMessageView[]>) {
      state.messages = action.payload;
      state.historyChecked = true;
      if (action.payload.length === 0 && !state.open) {
        state.unread = true;
      }
    },
    messageAdded(state, action: PayloadAction<ChatMessageView>) {
      state.messages.push(action.payload);
    },
  },
});

export const { panelOpened, panelClosed, historyLoaded, messageAdded } = chatSlice.actions;
export default chatSlice.reducer;
