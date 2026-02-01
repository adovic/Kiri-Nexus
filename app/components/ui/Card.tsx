import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  highlight?: boolean;
  title?: string;
  actions?: ReactNode;
};

export default function Card({ children, highlight, title, actions }: Props) {
  return (
    <div className={highlight ? "card card-highlight" : "card"}>
      {(title || actions) && (
        <div className="card-header">
          {title ? <h3>{title}</h3> : <span />}
          {actions ? <div className="card-actions">{actions}</div> : null}
        </div>
      )}
      <div className="card-body">{children}</div>
    </div>
  );
}
