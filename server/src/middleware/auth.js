import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export async function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({
      message: 'Authentication required',
    });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.sub).select(
      'name email role isActive',
    );

    if (!user || user.isActive === false) {
      return res.status(401).json({
        message: 'Invalid or expired token',
      });
    }

    req.user = {
      sub: user._id.toString(),
      role: user.role,
      name: user.name,
      email: user.email,
    };

    return next();
  } catch {
    return res.status(401).json({
      message: 'Invalid or expired token',
    });
  }
}

export function allowRoles(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        message: 'You do not have permission to access this resource',
      });
    }

    next();
  };
}
