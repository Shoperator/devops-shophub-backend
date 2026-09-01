/**
 * Latin letters, accented ones such as "ć" included, digits, and single
 * spaces between words.  */
export const SHOP_NAME_PATTERN =
  /^[\p{Script=Latin}\p{Mark}0-9]+( [\p{Script=Latin}\p{Mark}0-9]+)*$/u;

export const SHOP_NAME_MESSAGE =
  'name may only contain latin letters, digits and single spaces';
