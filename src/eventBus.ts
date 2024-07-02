import neovim from "neovim";
import { Disposable, EventEmitter } from "vscode";

// #region RedrawEventArgs

export interface VimHighlightUIAttributes {
    foreground?: number;
    background?: number;
    special?: number;
    reverse?: boolean;
    italic?: boolean;
    bold?: boolean;
    strikethrough?: boolean;
    // has special color
    underline?: boolean;
    // has special color
    undercurl?: boolean;
    blend?: number;
    altfont?: boolean;
}

interface IRedrawEventArg<N, A extends unknown[] = []> {
    name: N;
    args: A["length"] extends 0 ? undefined : A[];
}

type RedrawEventArgs =
    | IRedrawEventArg<"win_close", [grid: number]>
    | IRedrawEventArg<"win_external_pos", [grid: number, win: neovim.Window]>
    | IRedrawEventArg<
          "win_pos",
          [grid: number, win: neovim.Window, start_row: number, start_col: number, width: number, height: number]
      >
    | IRedrawEventArg<
          "win_viewport",
          [
              grid: number,
              win: neovim.Window,
              topline: number,
              botline: number,
              curline: number,
              curcol: number,
              line_count: number,
              scroll_delta: number,
          ]
      >
    | IRedrawEventArg<"grid_resize", [grid: number, width: number, height: number]>
    | IRedrawEventArg<
          "grid_line",
          [
              grid: number,
              row: number,
              colr_start: number,
              cells: [text: string, hl_id?: number, repeat?: number][],
              wrap: boolean,
          ]
      >
    | IRedrawEventArg<
          "grid_scroll",
          [grid: number, top: number, bot: number, left: number, right: number, rows: number, cols: number]
      >
    | IRedrawEventArg<"grid_cursor_goto", [grid: number, row: number, column: number]>
    | IRedrawEventArg<"grid_destroy", [grid: number]>
    | IRedrawEventArg<
          "hl_attr_define",
          [
              hl_id: number,
              rgb_attr: VimHighlightUIAttributes,
              cterm_attr: never,
              info: [{ kind: "ui" | "syntax" | "terminal"; ui_name: string; hi_name: string }],
          ]
      >
    | IRedrawEventArg<
          "msg_show",
          [
              kind:
                  | ""
                  | "confirm"
                  | "confirm_sub"
                  | "emsg"
                  | "echo"
                  | "echomsg"
                  | "echoerr"
                  | "lua_error"
                  | "rpc_error"
                  | "return_prompt"
                  | "quickfix"
                  | "search_count"
                  | "wmsg",
              content: [number, string][],
              replace_last: boolean,
          ]
      >
    | IRedrawEventArg<"msg_showcmd", [content: [number, string][]]>
    | IRedrawEventArg<"msg_showmode", [content: [number, string][]]>
    | IRedrawEventArg<"msg_ruler", [content: [number, string][]]>
    | IRedrawEventArg<
          "mode_info_set",
          [
              cursor_style_enabled: boolean,
              mode_info: { name: string; cursor_shape: "block" | "horizontal" | "vertical" }[],
          ]
      >
    // ["msg_history_show", entries]
    | IRedrawEventArg<"msg_history_show", [string, [number, string][]][][]>
    | IRedrawEventArg<"msg_clear">
    | IRedrawEventArg<"mode_change", [mode: string, mode_idx: number]>
    | IRedrawEventArg<
          "cmdline_show",
          [content: [object, string][], pos: number, firstc: string, prompt: string, indent: number, level: number]
      >
    | IRedrawEventArg<"cmdline_hide">
    | IRedrawEventArg<"mouse_on">
    | IRedrawEventArg<"mouse_off">
    | IRedrawEventArg<
          "popupmenu_show",
          [items: [string, string, string, string][], selected: number, row: number, col: number, grid: number]
      >
    | IRedrawEventArg<"popupmenu_select", [selected: number]>
    | IRedrawEventArg<"popupmenu_hide">;
// #endregion

interface BufferInfo {
    bufnr: number;
    name: string;
    variables: { vscode_uri?: string };
}

type EventsMapping = {
    // nvim
    redraw: RedrawEventArgs;
    // custom
    ["flush-redraw"]: [];
    ["open-file"]: [fileName: string, close: 1 | 0 | "all"];
    ["external-buffer"]: [info: BufferInfo, expandtab: 1 | 0, tabstop: number];
    ["window-changed"]: [winId: number];
    ["mode-changed"]: [mode: string];
    ["notify-recording"]: undefined;
    reveal: ["center" | "top" | "bottom", boolean];
    ["move-cursor"]: ["top" | "middle" | "bottom"];
    scroll: ["page" | "halfPage", "up" | "down"];
    ["scroll-line"]: ["up" | "down"];
    ["viewport-changed"]: [
        viewport: {
            // All positions are 0-based
            winid: number;
            bufnr: number;
            lnum: number;
            col: number;
            coladd: number;
            curswant: number;
            topline: number;
            botline: number;
            topfill: number;
            leftcol: number;
            skipcol: number;
        },
    ];
    ["visual-changed"]: [winId: number];
    ["statusline"]: [statusline: string];
    ["BufModifiedSet"]: [{ buf: number; modified: boolean }];
};

export interface Event<T extends keyof EventsMapping = keyof EventsMapping> {
    name: T;
    data: EventsMapping[T];
}

export type EventBusData<T extends keyof EventsMapping> = EventsMapping[T];

class EventBus implements Disposable {
    /**
     * All Nvim events are dispatched by this single EventEmitter.
     * Components can subscribe to event broadcasts using `EventBus.on()`.
     */
    private emitter!: EventEmitter<Event>;

    dispose() {
        this.emitter.dispose();
    }

    init() {
        this.emitter = new EventEmitter<Event>();
    }

    /**
     * Fires an event with the specified name and data.
     *
     * @param name - The name of the event.
     * @param data - The data associated with the event.
     */
    fire<T extends keyof EventsMapping>(name: T, data: EventsMapping[T]) {
        this.emitter.fire({ name, data });
    }

    /**
     * Registers a handler for the specified event name.
     *
     * @param name - The name of the event.
     * @param handler - The handler function for the event.
     * @param thisArg - The `this` context used when invoking the handler function.
     * @param disposables - An array to which a disposable will be added.
     * @return — Disposable which unregisters this event handler on disposal.
     */
    on<T extends keyof EventsMapping>(
        name: T | T[],
        handler: (data: Event<T>["data"]) => void,
        thisArg?: unknown,
        disposables?: Disposable[],
    ) {
        return this.emitter.event(
            (e) => {
                if (name === e.name || (Array.isArray(name) && name.includes(e.name as T))) {
                    handler.call(thisArg, e.data as Event<T>["data"]);
                }
            },
            thisArg,
            disposables,
        );
    }
}

/**
 * Handle all nvim events and custom events
 */
export const eventBus = new EventBus();
