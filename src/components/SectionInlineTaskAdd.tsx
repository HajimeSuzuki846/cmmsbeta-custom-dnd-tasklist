import {
    type KeyboardEvent,
    type MouseEvent,
    type MutableRefObject,
    type PointerEvent,
    type ReactElement,
    useEffect,
    useRef
} from "react";
import classNames from "classnames";

function stopPointerForDrag(e: MouseEvent | PointerEvent): void {
    e.stopPropagation();
}

export type SectionInlineTaskAddProps = {
    widgetName: string;
    sectionKey: string;
    expanded: boolean;
    draft: string;
    onDraftChange: (value: string) => void;
    onExpand: () => void;
    onCollapse: () => void;
    onCommit: (trimmedTitle: string) => void;
    busy: boolean;
    canTrigger: boolean;
    parentBlurSuppressionRef?: MutableRefObject<boolean>;
};

export function SectionInlineTaskAdd(props: SectionInlineTaskAddProps): ReactElement {
    const {
        widgetName,
        sectionKey,
        expanded,
        draft,
        onDraftChange,
        onExpand,
        onCollapse,
        onCommit,
        busy,
        canTrigger,
        parentBlurSuppressionRef
    } = props;
    const inputId = `${widgetName}-inline-add-${sectionKey}`;
    const inputRef = useRef<HTMLInputElement>(null);
    const skipBlurCommitRef = useRef(false);

    useEffect(() => {
        if (expanded) {
            const t = window.setTimeout(() => {
                inputRef.current?.focus();
                inputRef.current?.select();
            }, 0);
            return () => window.clearTimeout(t);
        }
        return undefined;
    }, [expanded]);

    const commitOrCollapse = (): void => {
        if (skipBlurCommitRef.current || parentBlurSuppressionRef?.current) {
            return;
        }
        const t = draft.trim();
        if (t !== "") {
            onCommit(t);
        } else {
            onCollapse();
        }
    };

    const onInputKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
        if (e.key === "Enter") {
            e.preventDefault();
            skipBlurCommitRef.current = true;
            const t = draft.trim();
            if (t !== "") {
                onCommit(t);
            } else {
                onCollapse();
            }
            window.requestAnimationFrame(() => {
                skipBlurCommitRef.current = false;
            });
        } else if (e.key === "Escape") {
            e.preventDefault();
            skipBlurCommitRef.current = true;
            onDraftChange("");
            onCollapse();
            window.requestAnimationFrame(() => {
                skipBlurCommitRef.current = false;
            });
        }
    };

    if (!expanded) {
        return (
            <li className="widget-custom-dnd-tasklist__row widget-custom-dnd-tasklist__row--add-trigger">
                <div
                    className="widget-custom-dnd-tasklist__handle widget-custom-dnd-tasklist__handle--placeholder"
                    aria-hidden
                />
                <div className="widget-custom-dnd-tasklist__body widget-custom-dnd-tasklist__body--add-trigger">
                    <button
                        type="button"
                        className="widget-custom-dnd-tasklist__add-trigger"
                        onClick={() => onExpand()}
                        disabled={busy || !canTrigger}
                    >
                        タスクを追加…
                    </button>
                </div>
            </li>
        );
    }

    return (
        <li className="widget-custom-dnd-tasklist__row widget-custom-dnd-tasklist__row--inline-add">
            <div
                className="widget-custom-dnd-tasklist__handle widget-custom-dnd-tasklist__handle--disabled"
                aria-hidden
                title={undefined}
            >
                <span className="widget-custom-dnd-tasklist__handle-icon">⋮⋮</span>
            </div>
            <div
                className="widget-custom-dnd-tasklist__body widget-custom-dnd-tasklist__body--inline-add"
                onMouseDown={stopPointerForDrag}
                onPointerDown={stopPointerForDrag}
            >
                <label htmlFor={inputId} className="widget-custom-dnd-tasklist__visually-hidden">
                    新しいタスク名
                </label>
                <input
                    ref={inputRef}
                    id={inputId}
                    type="text"
                    className={classNames("widget-custom-dnd-tasklist__inline-add-input")}
                    placeholder="タスク名を入力"
                    value={draft}
                    disabled={busy}
                    onChange={e => onDraftChange(e.target.value)}
                    onBlur={() => commitOrCollapse()}
                    onKeyDown={onInputKeyDown}
                    autoComplete="off"
                />
            </div>
        </li>
    );
}
