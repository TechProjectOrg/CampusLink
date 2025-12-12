import { Request, Response, NextFunction } from 'express';

const validatePassword = (req: Request, res: Response, next: NextFunction) => {
  const { password } = req.body;

  if (!password) {
    return res.status(400).json({
      success: false,
      message: 'Password is required.',
    });
  }

  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*]).{8,}$/;

  if (!passwordRegex.test(password)) {
    return res.status(400).json({
      success: false,
      message: 'Password does not meet the requirements.',
      details: 'Password must be at least 8 characters long and contain at least one lowercase letter, one uppercase letter, one number, and one special character (!@#$%^&*).',
    });
  }

  next();
};

export default validatePassword;
