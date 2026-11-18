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

export const me = asyncHandler(async (req, res) => {
  res.json({ user: await authService.currentUser(req.user.id, req.user.email) });
});
