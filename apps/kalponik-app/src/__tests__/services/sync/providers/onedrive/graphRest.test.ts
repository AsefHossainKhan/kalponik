// @vitest-environment node
import { describe, expect, test } from 'vitest';
import {
  childrenUrl,
  contentUrl,
  deleteItemUrl,
  encodeGraphPath,
  itemUrl,
  meUrl,
  uploadSessionUrl,
} from '@/services/sync/providers/onedrive/graphRest';

const APPROOT = 'https://graph.microsoft.com/v1.0/me/drive/special/approot';

describe('graphRest', () => {
  test('encodeGraphPath strips slashes and encodes each segment', () => {
    expect(encodeGraphPath('/Kalponik/books/a b/config.json')).toBe(
      'Kalponik/books/a%20b/config.json',
    );
    expect(encodeGraphPath('/')).toBe('');
  });

  test('itemUrl addresses by path with a $select', () => {
    expect(itemUrl('/Kalponik/x.json', 'size,cTag,file')).toBe(
      `${APPROOT}:/Kalponik/x.json?$select=size,cTag,file`,
    );
  });

  test('contentUrl targets the content endpoint', () => {
    expect(contentUrl('/Kalponik/x.json')).toBe(`${APPROOT}:/Kalponik/x.json:/content`);
  });

  test('childrenUrl of a nested path uses the colon form; root uses no colon', () => {
    expect(childrenUrl('/Kalponik/books')).toBe(
      `${APPROOT}:/Kalponik/books:/children?$select=name,size,cTag,file,folder&$top=200`,
    );
    expect(childrenUrl('/')).toBe(
      `${APPROOT}/children?$select=name,size,cTag,file,folder&$top=200`,
    );
  });

  test('deleteItemUrl + uploadSessionUrl + meUrl', () => {
    expect(deleteItemUrl('/Kalponik/x')).toBe(`${APPROOT}:/Kalponik/x`);
    expect(uploadSessionUrl('/Kalponik/b.epub')).toBe(
      `${APPROOT}:/Kalponik/b.epub:/createUploadSession`,
    );
    expect(meUrl()).toBe(
      'https://graph.microsoft.com/v1.0/me?$select=userPrincipalName,mail,displayName',
    );
  });
});
