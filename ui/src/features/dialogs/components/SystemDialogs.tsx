import React from "react";
import { Dialog } from "@/widgets";

interface GeminiAuthDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSetup: () => void;
}

export const GeminiAuthDialog: React.FC<GeminiAuthDialogProps> = ({
  isOpen,
  onClose,
  onSetup,
}) => {
  return (
    <Dialog
      isOpen={isOpen}
      title="Gemini API Key Required"
      message={`To begin using the chat, please configure your Gemini API key.`}
      variant="info"
      actions={[
        {
          label: "Cancel",
          onClick: onClose,
          variant: "secondary",
        },
        {
          label: "Configure API Key",
          onClick: onSetup,
          variant: "primary",
        },
      ]}
    />
  );
};

interface ExistingProfileDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ExistingProfileDialog: React.FC<ExistingProfileDialogProps> = ({
  isOpen,
  onClose,
}) => {
  return (
    <Dialog
      isOpen={isOpen}
      title="Account Already Signed In"
      message={`This account is already signed in.`}
      variant="info"
      actions={[
        {
          label: "Close",
          onClick: onClose,
          variant: "primary",
        },
      ]}
    />
  );
};

interface ImgBBAuthDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSetup: () => void;
}

export const ImgBBAuthDialog: React.FC<ImgBBAuthDialogProps> = ({
  isOpen,
  onClose,
  onSetup,
}) => {
  return (
    <Dialog
      isOpen={isOpen}
      title="ImgBB API Key Required"
      message={`To use Google Lens features, please configure your ImgBB API key.`}
      variant="info"
      actions={[
        {
          label: "Cancel",
          onClick: onClose,
          variant: "secondary",
        },
        {
          label: "Configure API Key",
          onClick: onSetup,
          variant: "primary",
        },
      ]}
    />
  );
};

interface RemoveAccountDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export const RemoveAccountDialog: React.FC<RemoveAccountDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
}) => {
  return (
    <Dialog
      isOpen={isOpen}
      title="Confirm Account Removal"
      message={`Are you sure you want to remove this account?\nThis action is irreversible.`}
      variant="warning"
      actions={[
        {
          label: "Cancel",
          onClick: onClose,
          variant: "secondary",
        },
        {
          label: "Remove Account",
          onClick: onConfirm,
          variant: "danger",
        },
      ]}
    />
  );
};

interface DeleteChatDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export const DeleteChatDialog: React.FC<DeleteChatDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
}) => {
  return (
    <Dialog
      isOpen={isOpen}
      variant="error"
      title="Delete Conversation"
      message={`Are you sure you want to delete this conversation?\nThis action is irreversible.`}
      actions={[
        {
          label: "Cancel",
          onClick: onClose,
          variant: "secondary",
        },
        { label: "Delete Conversation", onClick: onConfirm, variant: "danger" },
      ]}
    />
  );
};

interface DeleteMultipleChatsDialogProps {
  isOpen: boolean;
  count: number;
  onClose: () => void;
  onConfirm: () => void;
}

export const DeleteMultipleChatsDialog: React.FC<
  DeleteMultipleChatsDialogProps
> = ({ isOpen, count, onClose, onConfirm }) => {
  return (
    <Dialog
      isOpen={isOpen}
      variant="error"
      title="Delete Multiple Conversations"
      message={`Are you sure you want to delete ${count} conversations?\nThis action is irreversible.`}
      actions={[
        {
          label: "Cancel",
          onClick: onClose,
          variant: "secondary",
        },
        { label: "Delete All", onClick: onConfirm, variant: "danger" },
      ]}
    />
  );
};

interface LoginRequiredDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onLogin: () => void;
}

export const LoginRequiredDialog: React.FC<LoginRequiredDialogProps> = ({
  isOpen,
  onClose,
  onLogin,
}) => {
  return (
    <Dialog
      isOpen={isOpen}
      title="Login Required"
      message="You need to sign in to upload images or use AI features."
      variant="info"
      actions={[
        {
          label: "Cancel",
          onClick: onClose,
          variant: "secondary",
        },
        {
          label: "Sign In",
          onClick: onLogin,
          variant: "primary",
        },
      ]}
    />
  );
};
