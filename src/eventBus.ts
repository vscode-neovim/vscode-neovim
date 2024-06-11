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
    | IRedrawEventArg<"win_close", [number]> // ["win_close", grid]
    // ["win_external_pos", grid, win]
    | IRedrawEventArg<"win_external_pos", [number, neovim.Window]>
    // ["win_pos", grid, win, start_row, start_col, width, height]
    | IRedrawEventArg<"win_pos", [number, neovim.Window, number, number, number, number]>
    // ["win_viewport", grid, win, topline, botline, curline, curcol, line_count, scroll_delta]
    | IRedrawEventArg<"win_viewport", [number, neovim.Window, number, number, number, number, number, number]>
    // ["grid_resize", grid, width, height]
    | IRedrawEventArg<"grid_resize", [number, number, number]>
    // ["grid_line", grid, row, col_start, cells, wrap]
    | IRedrawEventArg<"grid_line", [number, number, number, [string, number, number][], boolean]>
    //   ["grid_scroll", grid, top, bot, left, right, rows, cols]
    | IRedrawEventArg<"grid_scroll", [number, number, number, number, number, number, number]>
    // ["grid_cursor_goto", grid, row, column]
    | IRedrawEventArg<"grid_cursor_goto", [number, number, number]>
    // ["grid_destroy", grid]
    | IRedrawEventArg<"grid_destroy", [number]>
    // ["hl_attr_define", id, rgb_attr, cterm_attr, info]
    | IRedrawEventArg<
          "hl_attr_define",
          [
              number,
              VimHighlightUIAttributes,
              never,
              [{ kind: "ui" | "syntax" | "terminal"; ui_name: string; hi_name: string }],
          ]
      >
    // ["msg_show", kind, content, replace_last]
    | IRedrawEventArg<
          "msg_show",
          [
              (
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
                  | "wmsg"
              ),
              [number, string][],
              boolean,
          ]
      >
    // ["msg_showcmd", content]
    | IRedrawEventArg<"msg_showcmd", [[number, string][]]>
    // ["msg_showmode", content]
    | IRedrawEventArg<"msg_showmode", [[number, string][]]>
    // ["msg_ruler", content]
    | IRedrawEventArg<"msg_ruler", [[number, string][]]>
    // ["mode_info_set", cursor_style_enabled, mode_info]
    | IRedrawEventArg<"mode_info_set", [boolean, { name: string; cursor_shape: "block" | "horizontal" | "vertical" }[]]>
    // ["msg_history_show", entries]
    | IRedrawEventArg<"msg_history_show", [string, [number, string][]][][]>
    // ["msg_clear"]
    | IRedrawEventArg<"msg_clear">
    // ["mode_change", mode, mode_idx]
    | IRedrawEventArg<"mode_change", [string, number]>
    // ["cmdline_show", content, pos, firstc, prompt, indent, level]
    | IRedrawEventArg<"cmdline_show", [[object, string][], number, string, string, number, number]>
    // ["cmdline_hide"]
    | IRedrawEventArg<"cmdline_hide">
    // ["mouse_on"]
    | IRedrawEventArg<"mouse_on">
    // ["mouse_off"]
    | IRedrawEventArg<"mouse_off">
    | IRedrawEventArg<"popupmenu_show", [[string, string, string, string][], number, number, number, number]>
    | IRedrawEventArg<"popupmenu_select", [number]>
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
    ["open-file"]: [string, 1 | 0 | "all"];
    ["external-buffer"]: [BufferInfo, 1 | 0, number];
    ["window-changed"]: [number];
    ["mode-changed"]: [string];
    ["notify-recording"]: undefined;
    reveal: ["center" | "top" | "bottom", boolean];
    ["move-cursor"]: ["top" | "middle" | "bottom"];
    scroll: ["page" | "halfPage", "up" | "down"];
    ["scroll-line"]: ["up" | "down"];
    ["viewport-changed"]: [
        {
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
    ["visual-changed"]: [number];
    ["statusline"]: [string];
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
