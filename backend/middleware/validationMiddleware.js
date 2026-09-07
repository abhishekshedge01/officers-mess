/**
 * Middleware generator to ensure required fields exist and are not empty in req.body.
 *
 * @param  {...string} fields Field names required in request body
 */
export const validateRequired = (...fields) => {
  return (req, res, next) => {
    for (const field of fields) {
      if (
        req.body[field] === undefined ||
        req.body[field] === null ||
        String(req.body[field]).trim() === ""
      ) {
        return res.status(400).json({ message: `${field} is required` });
      }
    }
    next();
  };
};
