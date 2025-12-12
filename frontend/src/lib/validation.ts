export const validatePassword = (password: string) => {
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*]).{8,}$/;
  return passwordRegex.test(password);
};

export const getPasswordValidationMessage = (password: string): string[] => {
    const messages: string[] = [];
    if (password.length < 8) {
        messages.push("Must be at least 8 characters long.");
    }
    if (!/(?=.*[a-z])/.test(password)) {
        messages.push("Must contain at least one lowercase letter.");
    }
    if (!/(?=.*[A-Z])/.test(password)) {
        messages.push("Must contain at least one uppercase letter.");
    }
    if (!/(?=.*\d)/.test(password)) {
        messages.push("Must contain at least one number.");
    }
    if (!/(?=.*[!@#$%^&*])/.test(password)) {
        messages.push("Must contain at least one special character (!@#$%^&*).");
    }
    return messages;
}
