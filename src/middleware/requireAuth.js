async function requireAuth(req, res, next) {
  req.user = {
    uid: 'local_test_user',
  };

  return next();
}

module.exports = {
  requireAuth,
};