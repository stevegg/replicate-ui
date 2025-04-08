import { ToastActionElement, ToastProps } from "@/components/ui/toast";
import { ReactNode } from "react";

export interface ToasterToast extends Omit<ToastProps, "title" | "description" | "action"> {
  id: string;
  title?: ReactNode;
  description?: ReactNode;
  action?: ToastActionElement;
}

export interface ToastState {
  toasts: ToasterToast[];
}

export interface UseToastReturn extends ToastState {
  toast: (props: Omit<ToasterToast, "id">) => {
    id: string;
    dismiss: () => void;
    update: (props: ToasterToast) => void;
  };
  dismiss: (toastId?: string) => void;
}

export function useToast(): UseToastReturn;
export function toast(props: Omit<ToasterToast, "id">): {
  id: string;
  dismiss: () => void;
  update: (props: ToasterToast) => void;
};
