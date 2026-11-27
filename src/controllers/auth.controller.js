/**
 * Controllers are deliberately thin: read the already-validated input, call
 * one service, send the result. No business rule lives in this layer, which is
 * why the services can be tested without Express and the routes can be read as
 * a table of contents.
 */
import asyncHandler from '../utils/asyncHandler.js';
import * as authService from '../services/auth.service.js';

export const register = asyncHandler(async (req, res) => {
  const result = await authService.register(req.validated.body);
  res.status(201).json(result);
});

export const login = asyncHandler(async (req, res) => {
  const result = await authService.login(req.validated.body);
  res.json(result);
});

/** "Forgot password?": sends the reset link. Same answer whether or not the e-mail exists. */
export const forgot = asyncHandler(async (req, res) => {
  const origin = req.get('origin') || `${req.protocol}://${req.get('host')}`;
  await authService.requestPasswordReset(req.validated.body.email, origin);
  res.json({ sent: true });
});

/** The page from the e-mail link sets the new password; the person is then logged in. */
export const reset = asyncHandler(async (req, res) => {
  res.json(await authService.resetPassword(req.validated.body));
});

export const me = asyncHandler(async (req, res) => {
  res.json({ user: await authService.currentUser(req.user.id, req.user.email) });
});
