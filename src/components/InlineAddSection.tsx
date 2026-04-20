import {
    type KeyboardEvent,
    type MutableRefObject,
    type PointerEvent,
    type ReactElement,
    useEffect,
    useRef
} from "react";
import classNames from "classnames";

function stopPointerForWidget(e: PointerEvent): void {
    e.stopPropagation();
}

export type InlineAddSectionProps = {
    widgetName: string;
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

export function InlineAddSection(props: InlineAddSectionProps): ReactElement {
    const {
        widgetName,
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

    const inputId = `${widgetName}-inline-add-section`;
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
            <div className="widget-custom-dnd-tasklist__section-add">
                <button
                    type="button"
                    className="widget-custom-dnd-tasklist__add-trigger"
                    onClick={() => onExpand()}
                    disabled={busy || !canTrigger}
                >
                    セクションを追加…
                </button>
            </div>
        );
    }

    return (
        <div className="widget-custom-dnd-tasklist__section-add widget-custom-dnd-tasklist__section-add--expanded">
            <label htmlFor={inputId} className="widget-custom-dnd-tasklist__visually-hidden">
                新しいセクション名
            </label>
            <input
                ref={inputRef}
                id={inputId}
                type="text"
                className={classNames("widget-custom-dnd-tasklist__inline-add-input")}
                placeholder="セクション名を入力"
                value={draft}
                disabled={busy}
                onChange={e => onDraftChange(e.target.value)}
                onPointerDown={stopPointerForWidget}
                onBlur={() => commitOrCollapse()}
                onKeyDown={onInputKeyDown}
                autoComplete="off"
            />
        </div>
    );
}

