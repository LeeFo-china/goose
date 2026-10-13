import { expect, test } from 'bun:test';
import { buildCameraProjectHref, normalizeCameraProjectFilters } from './camera-project-filters';
test('defaults to bound projects and validates page/status', () => {
 expect(normalizeCameraProjectFilters({camera_page:'-2',project_status:'unknown',binding:'wrong'})).toEqual({page:1,keyword:'',binding:'bound',status:''});
 expect(normalizeCameraProjectFilters({camera_page:'2.8',project_status:'constructing',binding:'unbound',camera_keyword:' 梁森 '})).toEqual({page:2,keyword:'梁森',binding:'unbound',status:'constructing'});
});
test('paging retains binding, project status and search', () => {
 const url=new URL(buildCameraProjectHref({page:3,keyword:'寺东 & 1702',binding:'unbound',status:'constructing'}),'http://test');
 expect(Object.fromEntries(url.searchParams)).toEqual({camera_page:'3',camera_keyword:'寺东 & 1702',binding:'unbound',project_status:'constructing'});
});
