import { EventEmitter, Disposable } from "vscode";
import neovim from "neovim";

interface IRedrawEventArg<N, A> {
    name: N;
    args: A[];
    get firstArg(): A;
    get lastArg(): A;
}

type RedrawEventArgs = (
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
              {
                  foreground?: number;
                  background?: number;
                  special?: number;
                  reverse?: boolean;
                  italic?: boolean;
                  bold?: boolean;
                  strikethrough?: boolean;
                  underline?: boolean;
                  underdouble?: boolean;
                  underdotted?: boolean;
                  underdashed?: boolean;
                  undercurl?: boolean;
                  blend?: number;
              },
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
    | IRedrawEventArg<"msg_clear", []>
    // ["mode_change", mode, mode_idx]
    | IRedrawEventArg<"mode_change", [string, number]>
    // ["cmdline_show", content, pos, firstc, prompt, indent, level]
    | IRedrawEventArg<"cmdline_show", [[object, string][], number, string, string, number, number]>
    // ["cmdline_hide"]
    | IRedrawEventArg<"cmdline_hide", []>
    // ["mouse_on"]
    | IRedrawEventArg<"mouse_on", []>
    // ["mouse_off"]
    | IRedrawEventArg<"mouse_off", []>
    | IRedrawEventArg<"wildmenu_show", [string[]]>
)[];

type EventsMapping = {
    redraw: RedrawEventArgs;
};

export interface Event<T extends keyof EventsMapping = keyof EventsMapping> {
    name: T;
    data: EventsMapping[T];
}

export type EventBusData<T extends keyof EventsMapping> = EventsMapping[T];

class EventBus implements Disposable {
    private readonly emitter = new EventEmitter<Event>();

    dispose() {
        this.emitter.dispose();
    }

    fire<T extends keyof EventsMapping>(name: T, data: EventsMapping[T]) {
        this.emitter.fire({ name, data });
    }

    on<T extends keyof EventsMapping>(
        name: T,
        handler: (data: Event<T>["data"]) => void,
        thisArgs?: unknown,
        disposables?: Disposable[],
    ) {
        return this.emitter.event(
            (e) => name === e.name && handler.call(thisArgs, e.data as Event<T>["data"]),
            thisArgs,
            disposables,
        );
    }
}

export const eventBus = new EventBus();
