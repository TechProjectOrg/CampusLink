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

const USERNAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export const getUsernameValidationMessage = (username: string): string | null => {
    if (!username) return 'Username is required';
    if (username.length < 3) return 'Username must be at least 3 characters long';
    if (username.length > 50) return 'Username must be 50 characters or fewer';
    if (!USERNAME_PATTERN.test(username)) {
        return 'Username can only contain letters, numbers, and underscores, and cannot start with a digit';
    }
    return null;
};
